-- 지출 공개 범위(공동/나만 보기) (명세 2, AI-12)
-- 공개 범위는 save_expense가 판정한다. 클라이언트는 고르지 않는다.
-- private 지출은 작성자만 읽는다. 지출 본문뿐 아니라 박스·지정·대상 인원·사진·댓글·이력·Storage까지 같은 기준을 쓴다.

alter table public.expenses
  add column visibility text not null default 'shared' check (visibility in ('shared', 'private'));
-- 기존 지출은 default로 전부 shared가 된다.

-- ───────────────────────── 읽기 기준 ─────────────────────────

-- 이 지출을 읽을 수 있는가. 자식 테이블 RLS와 expense_history RPC가 공유하는 유일한 기준.
-- 소프트 삭제는 보지 않는다(이력·박스는 삭제된 지출도 읽어야 한다). 없는 지출이면 false.
create function public.can_read_expense(p_expense_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense_id and public.is_room_member(e.room_id)
      and (e.visibility = 'shared' or e.created_by = (select auth.uid()))
  );
$$;

-- item_assignees는 expense_id가 없어서 박스를 거쳐 간다.
create function public.can_read_item(p_item_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_expense((select i.expense_id from public.expense_items i where i.id = p_item_id));
$$;

-- Storage 정책용. 정책 안의 평범한 서브쿼리는 expenses RLS를 그대로 받아 남의 private 행을 못 보므로
-- (= 못 찾음 = 통과) definer 함수로 물어봐야 한다. 지출 행이 아직 없으면(저장 전 업로드) false.
create function public.is_others_private_expense(p_expense_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense_id and e.visibility = 'private' and e.created_by <> (select auth.uid())
  );
$$;

revoke execute on function public.can_read_expense(uuid), public.can_read_item(uuid),
  public.is_others_private_expense(uuid) from public, anon;
grant execute on function public.can_read_expense(uuid), public.can_read_item(uuid),
  public.is_others_private_expense(uuid) to authenticated;

-- ───────────────────────── RLS ─────────────────────────

alter policy expenses_select on public.expenses using (
  deleted_at is null and public.is_room_member(room_id)
  and (visibility = 'shared' or created_by = (select auth.uid())));
alter policy expense_items_select on public.expense_items using (public.can_read_expense(expense_id));
alter policy expense_photos_select on public.expense_photos using (public.can_read_expense(expense_id));
alter policy expense_scope_select on public.expense_scope using (public.can_read_expense(expense_id));
alter policy expense_history_select on public.expense_history using (public.can_read_expense(expense_id));
alter policy item_assignees_select on public.item_assignees using (public.can_read_item(item_id));
alter policy comments_select on public.comments using (public.can_read_expense(expense_id));
-- 읽을 수 없는 지출에는 댓글도 못 단다. room_id는 (expense_id, room_id) FK가 보장한다.
alter policy comments_insert on public.comments
  with check (author_id = (select auth.uid()) and public.can_read_expense(expense_id));

-- 영수증 파일은 <room_id>/<expense_id>/<uuid>.jpg. 남의 private 지출 폴더만 막는다.
-- 지출을 저장하기 전에 올린 사진도 읽어야 하므로 '읽을 수 있는 지출'이 아니라 '남의 private이 아님'으로 쓴다.
alter policy receipts_rw on storage.objects using (
  bucket_id = 'receipts' and public.is_room_member(((storage.foldername(name))[1])::uuid)
  and not public.is_others_private_expense(((storage.foldername(name))[2])::uuid));

-- ───────────────────────── RPC ─────────────────────────
-- expense_history 스냅샷은 _expense_snapshot의 to_jsonb(e)로 visibility가 자동 포함된다.

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
      krw_charged, card_last4, needs_review, ai_result, visibility)
    values (v_id, v_room.id, v_uid, v_payer_kind, v_payer, v_source, p_payload ->> 'merchant',
      v_date, (p_payload ->> 'paid_local_time')::time, v_currency, v_amount, v_krw, v_rate, v_base_date, v_fx_source,
      v_krw_charged, v_card_last4, coalesce((p_payload ->> 'needs_review')::boolean, false), p_payload -> 'ai_result',
      v_visibility);
  else
    update public.expenses set
      updated_by = v_uid, payer_kind = v_payer_kind, payer_member_id = v_payer, source = v_source,
      merchant = p_payload ->> 'merchant', paid_local_date = v_date, paid_local_time = (p_payload ->> 'paid_local_time')::time,
      currency = v_currency, amount_original = v_amount, krw_amount = v_krw, fx_rate = v_rate, fx_base_date = v_base_date,
      fx_source = v_fx_source, krw_charged = v_krw_charged, card_last4 = v_card_last4,
      needs_review = coalesce((p_payload ->> 'needs_review')::boolean, false), ai_result = p_payload -> 'ai_result',
      visibility = v_visibility, version = version + 1
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

create or replace function public.delete_expense(p_id uuid, p_expected_version int) returns void
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
  if v_e.visibility = 'private' and v_e.created_by <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if v_e.deleted_at is not null then return; end if;     -- 재전송 멱등
  if v_e.version is distinct from p_expected_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  update public.expenses set deleted_at = now(), deleted_by = auth.uid(), version = version + 1 where id = p_id;
  perform public._record_history(p_id, 'delete');
end;
$$;

-- 같은 방 멤버만. 남의 '나만 보기' 지출 이력은 거부한다. 소프트 삭제된 지출은 반환한다.
create or replace function public.expense_history(p_expense_id uuid) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_read_expense(p_expense_id) then
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
