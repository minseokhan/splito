-- 지출 저장·삭제·환율 재확정·이력 RPC (ARCHITECTURE §3·§5.1, PRD §7.1·§7.2, ADR-006·009)
-- 원화 확정은 서버만 한다. fx_rates 캐시만 읽고 외부 호출은 하지 않는다(캐시는 fx-rate Edge Function이 채운다).
-- 금액은 numeric → round/floor → bigint. 부동소수점 금지.

-- ───────────────────────── 내부 헬퍼(실행 권한 전면 회수) ─────────────────────────

-- 결제일부터 10일 거슬러 가장 최근 고시일의 1단위 환율. 없으면 0행(= pending).
create function public._lookup_fx(p_currency text, p_date date) returns table (rate numeric, base_date date)
language sql stable set search_path = '' as $$
  select f.rate, f.base_date from public.fx_rates f
  where f.currency = p_currency and f.base_date <= p_date and f.base_date >= p_date - 10
  order by f.base_date desc limit 1;
$$;

-- 지출 원화를 박스 원본 비율로 최대 잔여 배분. 정수 연산으로 정확히 한다:
-- 몫 = floor(krw·a·1000 / Σa·1000), 나머지가 큰 박스부터 1원씩, 동점이면 position 순. pending이면 전부 NULL.
create function public._allocate_items(p_expense_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_krw bigint;
  v_sum bigint;
begin
  select krw_amount into v_krw from public.expenses where id = p_expense_id;
  if v_krw is null then
    update public.expense_items set krw_amount = null where expense_id = p_expense_id;
    return;
  end if;

  with d as (
    select sum(amount_original * 1000) as d from public.expense_items where expense_id = p_expense_id
  ), q as (
    select i.id, i.position, x.n, d.d, div(x.n, d.d) - case when mod(x.n, d.d) < 0 then 1 else 0 end as fl
    from public.expense_items i cross join d cross join lateral (select v_krw * i.amount_original * 1000 as n) x
    where i.expense_id = p_expense_id
  ), r as (
    select id, fl, row_number() over (order by n - fl * d desc, position) as rn, v_krw - sum(fl) over () as rest from q
  )
  update public.expense_items i set krw_amount = r.fl + case when r.rn <= r.rest then 1 else 0 end
  from r where i.id = r.id;

  select sum(krw_amount) into v_sum from public.expense_items where expense_id = p_expense_id;
  if v_sum is distinct from v_krw then
    raise exception 'allocation mismatch for expense %: % <> %', p_expense_id, v_sum, v_krw;
  end if;
end;
$$;

-- 이력 스냅샷: 지출 + 박스(지정 포함) + 대상 인원 + 사진.
create function public._expense_snapshot(p_expense_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(e) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) || jsonb_build_object('assignee_member_ids', coalesce((
        select jsonb_agg(a.member_id order by a.member_id) from public.item_assignees a where a.item_id = i.id), '[]'))
        order by i.position)
      from public.expense_items i where i.expense_id = e.id), '[]'),
    'scope_member_ids', coalesce((
      select jsonb_agg(s.member_id order by s.member_id) from public.expense_scope s where s.expense_id = e.id), '[]'),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('storage_path', p.storage_path, 'kind', p.kind) order by p.storage_path)
      from public.expense_photos p where p.expense_id = e.id), '[]'))
  from public.expenses e where e.id = p_expense_id;
$$;

create function public._record_history(p_expense_id uuid, p_action text) returns void
language sql set search_path = '' as $$
  insert into public.expense_history (expense_id, room_id, actor_id, action, snapshot, at)
  select e.id, e.room_id, auth.uid(), p_action, public._expense_snapshot(e.id), clock_timestamp()
  from public.expenses e where e.id = p_expense_id;
$$;

-- ───────────────────────── save_expense ─────────────────────────

create function public.save_expense(p_payload jsonb, p_expected_version int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := (p_payload ->> 'id')::uuid;
  v_items jsonb := coalesce(nullif(p_payload -> 'items', 'null'), '[]');
  v_photos jsonb := coalesce(nullif(p_payload -> 'photos', 'null'), '[]');
  v_payer_kind text := p_payload ->> 'payer_kind';
  v_payer uuid := (p_payload ->> 'payer_member_id')::uuid;
  v_source text := p_payload ->> 'source';
  v_date date := (p_payload ->> 'paid_local_date')::date;
  v_currency text := p_payload ->> 'currency';
  v_krw_charged bigint := (p_payload ->> 'krw_charged')::bigint;
  v_manual_rate numeric(18, 6) := (p_payload ->> 'manual_rate')::numeric;
  v_card_last4 text := p_payload ->> 'card_last4';
  v_room public.rooms;
  v_old public.expenses;
  v_scope uuid[];
  v_people uuid[];
  v_amount numeric;
  v_n int;
  v_ok boolean;
  v_rate numeric;
  v_base_date date;
  v_fx_source text;
  v_krw bigint;
begin
  if v_uid is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if v_id is null then raise exception using errcode = 'P0001', message = 'INVALID_INPUT'; end if;

  select * into v_room from public.rooms where id = (p_payload ->> 'room_id')::uuid and deleted_at is null for update;
  if not found or public.my_member_id(v_room.id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  -- 멱등·동시성
  select * into v_old from public.expenses where id = v_id;
  if found then
    if v_old.room_id <> v_room.id then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
    if p_expected_version is null then
      return jsonb_build_object('id', v_old.id, 'version', v_old.version, 'krw_amount', v_old.krw_amount,
        'fx_source', v_old.fx_source, 'fx_rate', v_old.fx_rate, 'fx_base_date', v_old.fx_base_date);
    end if;
    if v_old.deleted_at is not null or v_old.version <> p_expected_version then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;
  elsif p_expected_version is not null then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  -- 형식
  if coalesce(v_source, '') not in ('receipt', 'card_text', 'card_image', 'voice', 'manual')
     or coalesce(v_currency, '') !~ '^[A-Z]{3}$' or v_date is null
     or v_manual_rate <= 0 or v_card_last4 !~ '^[0-9]{4}$'
     or jsonb_typeof(v_items) <> 'array' or jsonb_typeof(v_photos) <> 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  select sum((x ->> 'amount_original')::numeric(18, 3)), count(*),
         count(*) = count(x ->> 'id') and count(*) = count(x ->> 'amount_original')
           and count(*) = count(distinct (x ->> 'position')::int)
    into v_amount, v_n, v_ok
  from jsonb_array_elements(v_items) x;
  if not v_ok then raise exception using errcode = 'P0001', message = 'INVALID_INPUT'; end if;
  if exists (select 1 from jsonb_array_elements(v_photos) p
             where coalesce(p ->> 'storage_path', '') !~ ('^' || v_room.id || '/' || v_id || '/[0-9a-f-]{36}\.jpg$')
                or coalesce(p ->> 'kind', '') not in ('receipt', 'capture')) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  -- 금액·날짜
  if v_n = 0 or v_amount <= 0 or v_krw_charged <= 0 then
    raise exception using errcode = 'P0001', message = 'AMOUNT_INVALID';
  end if;
  if v_date > (now() at time zone 'Asia/Seoul')::date + 1 then
    raise exception using errcode = 'P0001', message = 'DATE_IN_FUTURE';
  end if;

  -- 사람
  v_scope := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p_payload -> 'scope_member_ids', '[]')) x);
  if cardinality(v_scope) = 0 then raise exception using errcode = 'P0001', message = 'SCOPE_EMPTY'; end if;
  if v_payer_kind = 'member' then
    if v_payer is null then raise exception using errcode = 'P0001', message = 'INVALID_PAYER'; end if;
  elsif v_payer_kind = 'pool' then
    if not v_room.pool_enabled then raise exception using errcode = 'P0001', message = 'INVALID_PAYER'; end if;
    v_payer := null;
  else
    raise exception using errcode = 'P0001', message = 'INVALID_PAYER';
  end if;
  v_people := v_scope || array(select a::uuid from jsonb_array_elements(v_items) x,
                               jsonb_array_elements_text(coalesce(x -> 'assignee_member_ids', '[]')) a);
  if v_payer is not null then v_people := v_people || v_payer; end if;
  if exists (select 1 from unnest(v_people) p
             where not exists (select 1 from public.room_members m
                               where m.id = p and m.room_id = v_room.id and m.left_at is null)) then
    raise exception using errcode = 'P0001', message = 'MEMBER_LEFT';
  end if;

  -- 원화 확정. 결제일·통화·원본 금액·청구액·수동 환율이 그대로면 기존 확정값 유지.
  if v_old.id is not null and v_old.fx_source <> 'pending'
     and v_old.paid_local_date = v_date and v_old.currency = v_currency and v_old.amount_original = v_amount
     and v_old.krw_charged is not distinct from v_krw_charged
     and v_manual_rate is not distinct from (case when v_old.fx_source = 'manual' then v_old.fx_rate end) then
    v_fx_source := v_old.fx_source; v_rate := v_old.fx_rate; v_base_date := v_old.fx_base_date; v_krw := v_old.krw_amount;
  elsif v_currency = 'KRW' then
    v_fx_source := 'krw'; v_rate := 1; v_krw := round(v_amount);
  elsif v_krw_charged is not null then
    v_fx_source := 'card_krw'; v_krw := v_krw_charged;
  elsif v_manual_rate is not null then
    v_fx_source := 'manual'; v_rate := v_manual_rate;
  else
    select o.rate into v_rate from public.room_fx_overrides o where o.room_id = v_room.id and o.currency = v_currency;
    if found then
      v_fx_source := 'manual';
    else
      select l.rate, l.base_date into v_rate, v_base_date from public._lookup_fx(v_currency, v_date) l;
      v_fx_source := case when found then 'kexim' else 'pending' end;
    end if;
  end if;
  if v_fx_source in ('kexim', 'manual') and v_krw is null then
    v_krw := round(v_amount * v_rate);  -- numeric round: 0.5는 0에서 멀어지는 쪽
  end if;

  -- upsert
  if v_old.id is null then
    insert into public.expenses (id, room_id, created_by, payer_kind, payer_member_id, source, merchant,
      paid_local_date, paid_local_time, currency, amount_original, krw_amount, fx_rate, fx_base_date, fx_source,
      krw_charged, card_last4, needs_review, ai_result)
    values (v_id, v_room.id, v_uid, v_payer_kind, v_payer, v_source, p_payload ->> 'merchant',
      v_date, (p_payload ->> 'paid_local_time')::time, v_currency, v_amount, v_krw, v_rate, v_base_date, v_fx_source,
      v_krw_charged, v_card_last4, coalesce((p_payload ->> 'needs_review')::boolean, false), p_payload -> 'ai_result');
  else
    update public.expenses set
      updated_by = v_uid, payer_kind = v_payer_kind, payer_member_id = v_payer, source = v_source,
      merchant = p_payload ->> 'merchant', paid_local_date = v_date, paid_local_time = (p_payload ->> 'paid_local_time')::time,
      currency = v_currency, amount_original = v_amount, krw_amount = v_krw, fx_rate = v_rate, fx_base_date = v_base_date,
      fx_source = v_fx_source, krw_charged = v_krw_charged, card_last4 = v_card_last4,
      needs_review = coalesce((p_payload ->> 'needs_review')::boolean, false), ai_result = p_payload -> 'ai_result',
      version = version + 1
    where id = v_id;
    delete from public.expense_items where expense_id = v_id;  -- item_assignees는 cascade
    delete from public.expense_scope where expense_id = v_id;
    delete from public.expense_photos where expense_id = v_id;
  end if;

  insert into public.expense_items (id, expense_id, room_id, position, name_original, name_ko, quantity,
    amount_original, needs_review, is_adjustment)
  select (x ->> 'id')::uuid, v_id, v_room.id, (x ->> 'position')::int, coalesce(x ->> 'name_original', ''), x ->> 'name_ko',
    coalesce((x ->> 'quantity')::numeric, 1), (x ->> 'amount_original')::numeric,
    coalesce((x ->> 'needs_review')::boolean, false), coalesce((x ->> 'is_adjustment')::boolean, false)
  from jsonb_array_elements(v_items) x;
  insert into public.item_assignees (item_id, member_id, room_id)
  select distinct (x ->> 'id')::uuid, a::uuid, v_room.id
  from jsonb_array_elements(v_items) x, jsonb_array_elements_text(coalesce(x -> 'assignee_member_ids', '[]')) a;
  insert into public.expense_scope (expense_id, member_id, room_id) select v_id, s, v_room.id from unnest(v_scope) s;
  insert into public.expense_photos (expense_id, room_id, storage_path, kind)
  select v_id, v_room.id, p ->> 'storage_path', p ->> 'kind' from jsonb_array_elements(v_photos) p;

  perform public._allocate_items(v_id);
  perform public._record_history(v_id, case when v_old.id is null then 'create' else 'update' end);

  return (select jsonb_build_object('id', e.id, 'version', e.version, 'krw_amount', e.krw_amount,
                                    'fx_source', e.fx_source, 'fx_rate', e.fx_rate, 'fx_base_date', e.fx_base_date)
          from public.expenses e where e.id = v_id);
end;
$$;

-- ───────────────────────── delete_expense ─────────────────────────

create function public.delete_expense(p_id uuid, p_expected_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
  v_e public.expenses;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select room_id into v_room_id from public.expenses where id = p_id;
  perform 1 from public.rooms where id = v_room_id and deleted_at is null for update;
  if not found or public.my_member_id(v_room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select * into v_e from public.expenses where id = p_id;  -- 잠금 후 다시 읽는다
  if v_e.deleted_at is not null then return; end if;     -- 재전송 멱등
  if v_e.version is distinct from p_expected_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  update public.expenses set deleted_at = now(), deleted_by = auth.uid(), version = version + 1 where id = p_id;
  perform public._record_history(p_id, 'delete');
end;
$$;

-- ───────────────────────── reconfirm_pending_fx ─────────────────────────

create function public.reconfirm_pending_fx(p_room_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.expenses;
  v_rate numeric;
  v_base_date date;
  v_fx_source text;
  v_count int := 0;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  perform 1 from public.rooms where id = p_room_id and deleted_at is null for update;
  if not found or public.my_member_id(p_room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  for v_e in select * from public.expenses where room_id = p_room_id and fx_source = 'pending' and deleted_at is null loop
    v_base_date := null;
    select o.rate into v_rate from public.room_fx_overrides o where o.room_id = p_room_id and o.currency = v_e.currency;
    if found then
      v_fx_source := 'manual';
    else
      select l.rate, l.base_date into v_rate, v_base_date from public._lookup_fx(v_e.currency, v_e.paid_local_date) l;
      if not found then continue; end if;
      v_fx_source := 'kexim';
    end if;

    update public.expenses set fx_source = v_fx_source, fx_rate = v_rate, fx_base_date = v_base_date,
      krw_amount = round(v_e.amount_original * v_rate), updated_by = auth.uid(), version = version + 1
    where id = v_e.id;
    perform public._allocate_items(v_e.id);
    perform public._record_history(v_e.id, 'update');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ───────────────────────── expense_history ─────────────────────────

-- 같은 방 멤버만. 소프트 삭제된 지출도 반환한다.
create function public.expense_history(p_expense_id uuid) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_room_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select room_id into v_room_id from public.expenses where id = p_expense_id;
  if not found or not public.is_room_member(v_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  return query
    select jsonb_build_object('id', h.id, 'action', h.action, 'actor_id', h.actor_id, 'actor_nickname', p.nickname,
                              'at', h.at, 'snapshot', h.snapshot)
    from public.expense_history h left join public.profiles p on p.id = h.actor_id
    where h.expense_id = p_expense_id
    order by h.at;
end;
$$;

-- ───────────────────────── 권한 ─────────────────────────

revoke execute on function public._lookup_fx(text, date), public._allocate_items(uuid), public._expense_snapshot(uuid),
  public._record_history(uuid, text) from public, anon, authenticated;
revoke execute on function public.save_expense(jsonb, int), public.delete_expense(uuid, int),
  public.reconfirm_pending_fx(uuid), public.expense_history(uuid) from public, anon;
grant execute on function public.save_expense(jsonb, int), public.delete_expense(uuid, int),
  public.reconfirm_pending_fx(uuid), public.expense_history(uuid) to authenticated;
