-- 내 통계·예산 (my-stats-spec) + 홈 카드 패키지 배지
-- 예산·코칭은 본인만 본다. 금액 기준은 전부 '내 몫'(공동 지출 중 내 분담액 + 내 나만 보기 지출).
-- 집계는 my_expense_shares가 지출 1건 단위로 내 몫을 내려주고, 화면이 기간·카테고리로 접는다.

-- ───────────────────────── 예산 ─────────────────────────
-- 사용자별 1행. alloc은 카테고리 코드 → 원 단위 정수.
create table public.trip_budgets (
  room_id uuid not null references public.rooms (id),
  user_id uuid not null references public.profiles (id),
  total_krw bigint not null check (total_krw > 0),
  alloc_mode text not null default 'none' check (alloc_mode in ('manual', 'ai', 'none')),
  alloc jsonb not null default '{}'::jsonb,
  -- 적용한 조정안: { id, title, per_day: { food: n, ... } }
  applied_plan jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.trip_budgets enable row level security;

-- 읽기는 본인 행만. 쓰기는 RPC(security definer)로만 한다.
create policy trip_budgets_select_own on public.trip_budgets
  for select to authenticated using (user_id = (select auth.uid()));

create function public.save_trip_budget(p_room_id uuid, p_total_krw bigint, p_alloc_mode text, p_alloc jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_alloc jsonb := coalesce(nullif(p_alloc, 'null'), '{}'::jsonb);
begin
  if v_uid is null or public.my_member_id(p_room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_total_krw is null or p_total_krw < 1 then
    raise exception using errcode = 'P0001', message = 'AMOUNT_INVALID';
  end if;
  if coalesce(p_alloc_mode, '') not in ('manual', 'ai', 'none') or jsonb_typeof(v_alloc) <> 'object' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  -- 배분 키는 카테고리 코드만, 값은 음이 아닌 정수만 받는다.
  if exists (
    select 1 from jsonb_each(v_alloc) a
    where a.key not in ('food', 'shopping', 'sightseeing', 'lodging', 'transport', 'other')
       or jsonb_typeof(a.value) <> 'number' or (a.value)::text::numeric < 0
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  insert into public.trip_budgets (room_id, user_id, total_krw, alloc_mode, alloc)
  values (p_room_id, v_uid, p_total_krw, p_alloc_mode, v_alloc)
  on conflict (room_id, user_id) do update
    set total_krw = excluded.total_krw, alloc_mode = excluded.alloc_mode,
        alloc = excluded.alloc, updated_at = now();
end;
$$;

-- 조정안 적용. p_plan이 null이면 적용을 해제한다.
create function public.apply_budget_plan(p_room_id uuid, p_plan jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.my_member_id(p_room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_plan is not null and jsonb_typeof(p_plan) <> 'object' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  update public.trip_budgets set applied_plan = p_plan, updated_at = now()
  where room_id = p_room_id and user_id = v_uid;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
end;
$$;

-- ───────────────────────── 내 몫 집계 ─────────────────────────
-- 지출 1건당 내 분담액. 분배 규칙은 room_balances와 같다(품목 1/N floor + 자투리는 결제자).
-- 나만 보기 지출은 내가 만든 것만 들어가고, 대상 인원이 나뿐이므로 자동으로 100%가 된다.
create function public.my_expense_shares(p_room_id uuid)
returns table (expense_id uuid, paid_local_date date, category text, merchant text,
               payer_kind text, payer_member_id uuid, visibility text,
               currency text, amount_original numeric, krw_amount bigint, my_share bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_me uuid;
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_me := public.my_member_id(p_room_id);
  if v_me is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  return query
  with r as (
    select * from public.rooms where id = p_room_id
  ), e as (
    select x.id, x.paid_local_date, x.category, x.merchant, x.payer_kind, x.payer_member_id,
           x.visibility, x.currency, x.amount_original, x.krw_amount, x.created_at,
           coalesce(x.payer_member_id, r.pool_owner_member_id) as burden_member_id
    from public.expenses x cross join r
    where x.room_id = p_room_id and x.deleted_at is null and x.fx_source <> 'pending'
      and (x.visibility = 'shared' or x.created_by = (select auth.uid()))
  ), box as (
    select i.id, i.expense_id, i.krw_amount, e.burden_member_id
    from public.expense_items i join e on e.id = i.expense_id
  ), eff as (  -- 실제 지정 인원 = 지정 ∩ 대상 인원. 비면 대상 인원 전체
    select b.id as item_id, s.member_id
    from box b join public.expense_scope s on s.expense_id = b.expense_id
    where exists (select 1 from public.item_assignees a where a.item_id = b.id and a.member_id = s.member_id)
       or not exists (select 1 from public.item_assignees a join public.expense_scope s2
                        on s2.expense_id = b.expense_id and s2.member_id = a.member_id
                      where a.item_id = b.id)
  ), share as (
    select b.id, b.expense_id, b.krw_amount, b.burden_member_id, c.n,
           floor(b.krw_amount::numeric / c.n)::bigint as q
    from box b join (select item_id, count(*) as n from eff group by item_id) c on c.item_id = b.id
  ), mine (expense_id, amt) as (
    select s.expense_id, s.q from share s join eff f on f.item_id = s.id and f.member_id = v_me
    union all
    select s.expense_id, s.krw_amount - s.q * s.n from share s where s.burden_member_id = v_me
  ), agg as (
    select m.expense_id, sum(m.amt)::bigint as amt from mine m group by m.expense_id
  )
  select e.id, e.paid_local_date, e.category, e.merchant, e.payer_kind, e.payer_member_id, e.visibility,
         e.currency::text, e.amount_original, e.krw_amount, a.amt
  from e join agg a on a.expense_id = e.id
  where a.amt <> 0
  order by e.paid_local_date, e.created_at;
end;
$$;

-- ───────────────────────── 홈 카드 패키지 배지 ─────────────────────────
-- 20261101010000_balances_visibility.sql 의 정의에 has_booking 한 칸만 더한다.
drop function public.my_rooms();
create function public.my_rooms()
returns table (room_id uuid, name text, base_currency text, start_date date, end_date date,
               status text, member_count int, total_krw bigint, my_net bigint, has_booking boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  return query
    select r.id, r.name, r.base_currency::text, r.start_date, r.end_date,
      case
        when c.n >= 2
         and exists (select 1 from public.expenses x
                     where x.room_id = r.id and x.deleted_at is null and x.visibility = 'shared')
         and not exists (select 1 from public.room_balances(r.id, true) b where b.net <> 0 or b.fx_pending_count > 0)
          then 'settled'
        when exists (select 1 from public.transfers t where t.room_id = r.id and t.voided_at is null) then 'settling'
        when c.n >= 2 then 'shared'
        else 'solo'
      end,
      c.n,
      coalesce((select sum(x.krw_amount) from public.expenses x
                where x.room_id = r.id and x.deleted_at is null and x.fx_source <> 'pending'
                  and (x.visibility = 'shared' or x.created_by = (select auth.uid()))), 0)::bigint,
      (select b.net from public.room_balances(r.id, false) b where b.member_id = m.id),
      exists (select 1 from public.trip_bookings k where k.room_id = r.id)
    from public.room_members m
    join public.rooms r on r.id = m.room_id
    cross join lateral (select count(*)::int as n from public.room_members a
                        where a.room_id = r.id and a.left_at is null) c
    where m.user_id = auth.uid() and m.kind = 'user' and m.left_at is null and r.deleted_at is null
    order by r.created_at desc;
end;
$$;

-- ───────────────────────── 권한 ─────────────────────────
revoke execute on function public.my_rooms(), public.my_expense_shares(uuid),
  public.save_trip_budget(uuid, bigint, text, jsonb), public.apply_budget_plan(uuid, jsonb) from public, anon;
grant execute on function public.my_rooms(), public.my_expense_shares(uuid),
  public.save_trip_budget(uuid, bigint, text, jsonb), public.apply_budget_plan(uuid, jsonb) to authenticated;
