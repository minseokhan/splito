-- 순잔액(room_balances)·방 목록(my_rooms) (ARCHITECTURE §5.1·§6.5, PRD §7.2, USER_FLOWS §5, ADR-007·011)
-- 순잔액의 유일한 정답. 저장하지 않고 매번 계산한다. 송금 매칭은 클라이언트(lib/matching)가 한다.
-- 분담은 floor(박스 원화 / 인원), 자투리(항상 ≥ 0)는 결제자(공금이면 통장 주인)가 부담한다.

create function public.room_balances(p_room_id uuid, p_confirmed_only boolean default false)
returns table (member_id uuid, kind text, representative_member_id uuid, joined_at timestamptz,
               left_at timestamptz, paid bigint, owed bigint, net bigint, fx_pending_count int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_sum bigint := 0;
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  for member_id, kind, representative_member_id, joined_at, left_at, paid, owed, net, fx_pending_count in
    with r as (
      select * from public.rooms where id = p_room_id
    ), e as (  -- 원화 확정된 활성 지출. 자투리 부담자 = 결제자, 공금이면 통장 주인
      select x.id, x.payer_kind, x.payer_member_id, x.krw_amount,
             coalesce(x.payer_member_id, r.pool_owner_member_id) as burden_member_id
      from public.expenses x cross join r
      where x.room_id = p_room_id and x.deleted_at is null and x.fx_source <> 'pending'
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
      select b.id, b.krw_amount, b.burden_member_id, c.n,
             floor(b.krw_amount::numeric / c.n)::bigint as q  -- bigint `/`는 0 쪽 버림이라 floor 명시
      from box b join (select item_id, count(*) as n from eff group by item_id) c on c.item_id = b.id
    ), t as (
      select from_member_id, to_member_id, amount_krw from public.transfers
      where room_id = p_room_id and voided_at is null and (not p_confirmed_only or confirmed_at is not null)
    ), ledger (mid, paid, owed) as (
      select payer_member_id, krw_amount, 0::bigint from e where payer_kind = 'member'
      union all select f.member_id, 0, s.q from eff f join share s on s.id = f.item_id
      union all select burden_member_id, 0, krw_amount - q * n from share
      union all select d.member_id, d.amount_krw, 0 from public.pool_deposits d where d.room_id = p_room_id
      union all select from_member_id, amount_krw, 0 from t
      union all select to_member_id, 0, amount_krw from t
      -- 남은 공금(입금 − 공금 결제)은 통장 주인이 돌려줄 돈. 부족하면 음수 = 받을 돈
      union all select r.pool_owner_member_id, 0,
        coalesce((select sum(d.amount_krw) from public.pool_deposits d where d.room_id = p_room_id), 0)
        - coalesce((select sum(krw_amount) from e where payer_kind = 'pool'), 0)
      from r where r.pool_owner_member_id is not null
    ), agg as (
      select mid, sum(paid)::bigint as paid, sum(owed)::bigint as owed from ledger group by mid
    ), own as (
      select m.id, m.kind, m.representative_member_id, m.joined_at, m.left_at,
             coalesce(a.paid, 0) as paid, coalesce(a.owed, 0) as owed
      from public.room_members m left join agg a on a.mid = m.id
      where m.room_id = p_room_id
    )
    select o.id, o.kind, o.representative_member_id, o.joined_at, o.left_at, o.paid, o.owed,
           case when o.kind = 'guest' then 0
                else o.paid - o.owed + coalesce((select sum(g.paid - g.owed) from own g
                                                 where g.kind = 'guest' and g.representative_member_id = o.id), 0)
           end::bigint,
           (select count(*)::int from public.expenses x
            where x.room_id = p_room_id and x.deleted_at is null and x.fx_source = 'pending')
    from own o
    order by o.joined_at, o.id
  loop
    v_sum := v_sum + net;
    return next;
  end loop;

  if v_sum <> 0 then
    raise exception 'room_balances invariant violated for room %: sum(net) = %', p_room_id, v_sum;
  end if;
end;
$$;

-- 내 활성 방 목록 + 상태 + 내 순잔액. 상태는 USER_FLOWS §5 순서대로 판정한다.
create function public.my_rooms()
returns table (room_id uuid, name text, base_currency text, start_date date, end_date date,
               status text, member_count int, total_krw bigint, my_net bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  return query
    select r.id, r.name, r.base_currency::text, r.start_date, r.end_date,
      case
        when c.n >= 2
         and exists (select 1 from public.expenses x where x.room_id = r.id and x.deleted_at is null)
         and not exists (select 1 from public.room_balances(r.id, true) b where b.net <> 0 or b.fx_pending_count > 0)
          then 'settled'
        when exists (select 1 from public.transfers t where t.room_id = r.id and t.voided_at is null) then 'settling'
        when c.n >= 2 then 'shared'
        else 'solo'
      end,
      c.n,
      coalesce((select sum(x.krw_amount) from public.expenses x
                where x.room_id = r.id and x.deleted_at is null and x.fx_source <> 'pending'), 0)::bigint,
      (select b.net from public.room_balances(r.id, false) b where b.member_id = m.id)
    from public.room_members m
    join public.rooms r on r.id = m.room_id
    cross join lateral (select count(*)::int as n from public.room_members a
                        where a.room_id = r.id and a.left_at is null) c
    where m.user_id = auth.uid() and m.kind = 'user' and m.left_at is null and r.deleted_at is null
    order by r.created_at desc;
end;
$$;

revoke execute on function public.room_balances(uuid, boolean), public.my_rooms() from public, anon;
grant execute on function public.room_balances(uuid, boolean), public.my_rooms() to authenticated;
