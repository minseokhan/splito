-- 지출 카테고리 (식비·쇼핑·관광·숙소·교통·기타)
-- AI가 추정해 미리 골라두고 사용자가 리뷰 화면에서 바꾼다. 지출 1건에 1개다(품목별이 아니다).
-- 기존 행은 null로 둔다 — 분류 근거가 없어서 백필하지 않는다.

alter table public.expenses
  add column category text check (category is null or
    category in ('food', 'shopping', 'sightseeing', 'lodging', 'transport', 'other'));

-- ───────────────────────── RPC ─────────────────────────
-- 20261101000000_expense_visibility.sql의 save_expense를 베이스로 category 저장만 더한다.
-- 모르는 값은 거부하지 않고 'other'로 접는다 — check 제약 위반으로 저장 전체가 날아가면 안 된다.
create or replace function public.save_expense(p_payload jsonb, p_expected_version int default null) returns jsonb
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
  v_category text := case
    when p_payload ->> 'category' is null then null
    when p_payload ->> 'category' in ('food', 'shopping', 'sightseeing', 'lodging', 'transport', 'other')
      then p_payload ->> 'category'
    else 'other'
  end;
  v_room public.rooms;
  v_me uuid;
  v_visibility text;
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
  if not found then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  v_me := public.my_member_id(v_room.id);
  if v_me is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  -- 멱등·동시성
  select * into v_old from public.expenses where id = v_id;
  if found then
    if v_old.room_id <> v_room.id then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
    -- 남의 '나만 보기' 지출은 못 건드린다. 쓰기로 공개 범위를 뒤집어 읽는 우회를 막는다.
    if v_old.visibility = 'private' and v_old.created_by <> v_uid then
      raise exception using errcode = 'P0001', message = 'FORBIDDEN';
    end if;
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

  -- 공개 범위는 서버가 판정한다. 내가 결제하고 대상 인원이 나뿐일 때만 '나만 보기'.
  -- 공금 결제(v_payer null)는 항상 공동. 남이 만든 지출을 내 단독 지출로 고친 경우도 공동으로 둔다
  -- (private은 작성자만 읽으므로, 그대로 두면 편집자가 자기가 저장한 지출을 못 보게 된다).
  v_visibility := case
    when v_payer = v_me and cardinality(v_scope) = 1 and v_scope[1] = v_me
         and coalesce(v_old.created_by, v_uid) = v_uid then 'private'
    else 'shared'
  end;

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
      krw_charged, card_last4, needs_review, ai_result, visibility, category)
    values (v_id, v_room.id, v_uid, v_payer_kind, v_payer, v_source, p_payload ->> 'merchant',
      v_date, (p_payload ->> 'paid_local_time')::time, v_currency, v_amount, v_krw, v_rate, v_base_date, v_fx_source,
      v_krw_charged, v_card_last4, coalesce((p_payload ->> 'needs_review')::boolean, false), p_payload -> 'ai_result',
      v_visibility, v_category);
  else
    update public.expenses set
      updated_by = v_uid, payer_kind = v_payer_kind, payer_member_id = v_payer, source = v_source,
      merchant = p_payload ->> 'merchant', paid_local_date = v_date, paid_local_time = (p_payload ->> 'paid_local_time')::time,
      currency = v_currency, amount_original = v_amount, krw_amount = v_krw, fx_rate = v_rate, fx_base_date = v_base_date,
      fx_source = v_fx_source, krw_charged = v_krw_charged, card_last4 = v_card_last4,
      needs_review = coalesce((p_payload ->> 'needs_review')::boolean, false), ai_result = p_payload -> 'ai_result',
      visibility = v_visibility, category = v_category, version = version + 1
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

-- ───────────────────────── 권한 ─────────────────────────
-- create or replace는 ACL을 유지하지만, 베이스(20261029020000)의 설정을 명시해 둔다.
revoke execute on function public.save_expense(jsonb, int) from public, anon;
grant execute on function public.save_expense(jsonb, int) to authenticated;
