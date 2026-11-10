-- QR 참여를 '그 지출에 들어간 것'으로 만들고, 지출 상세에서 품목 지정을 저장할 길을 연다.
--
-- 흐름(사용자 확인): 석식 지출을 올린다 → [이 자리 정산]으로 QR을 보여준다 →
-- 모르는 사람이 이름만 넣고 참여한다 → **그 순간 그 지출의 '함께한 사람'이 2명이 된다** →
-- 결제자가 지출 상세에서 품목마다 누가 먹었는지 고르고 저장한다 →
-- 그 사람이 웹을 새로고침하면 자기가 먹은 것만 계산된 금액이 보인다.
--
-- 지금까지 막혀 있던 두 곳:
--   1. spot_join이 sent_at(결제자가 시트에서 [보내기]를 누른 시각)이 있을 때만 expense_scope에
--      넣었다. QR만 띄우고 보내기를 누르지 않으면 참여자가 장부에 들어가지 않아, 지출 상세의
--      '함께한 사람'이 결제자 혼자로 남고 품목 인원 선택도 뜨지 않았다(화면은 2명 이상일 때만
--      고를 수 있게 그린다).
--   2. 품목 지정만 바꾸는 길이 save_expense뿐이었다. 그 함수는 금액·환율·박스를 다시 확정하는
--      무거운 경로라, 다 끝난 지출의 '누가 먹었는지'만 고치는 데 쓰기에 맞지 않는다.

-- ───────────────────────── 1. 참여 = 그 지출에 들어간 것 ─────────────────────────

-- sent_at 조건을 뺀다. 나머지는 20261104074000 정의 그대로.
-- [보내기]는 '어느 지출을 묶을지' 고르는 단계로 남는다 — 참여 자체와는 별개다.
create or replace function public.spot_join(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_spot public.spot_settles;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 1 and 12 then
    return jsonb_build_object('error', 'INVALID_INPUT');
  end if;
  select s.* into v_spot from public.spot_settles s
  join public.rooms r on r.id = s.room_id and r.deleted_at is null
  where s.token = p_token for update;
  if not found then return jsonb_build_object('error', 'SPOT_GONE'); end if;

  if (select count(*) from public.spot_participants where spot_id = v_spot.id and is_qr)
     >= public._spot_qr_limit() then
    return jsonb_build_object('error', 'SPOT_FULL');
  end if;

  -- 대표자 = 결제자. 그래야 결제자가 이 사람 대신 송금을 기록·확인할 수 있다(_acts_for).
  insert into public.room_members (room_id, kind, guest_name, representative_member_id, created_by, spot_only)
  values (v_spot.room_id, 'guest', v_name, v_spot.payer_member_id, v_spot.created_by, true)
  returning id into v_id;
  insert into public.spot_participants (spot_id, member_id, room_id, is_qr)
  values (v_spot.id, v_id, v_spot.room_id, true);

  -- 참여한 순간 고른 지출들의 대상 인원이 된다. 보내기를 기다리지 않는다.
  insert into public.expense_scope (expense_id, member_id, room_id)
  select x.expense_id, v_id, v_spot.room_id from public.spot_expenses x where x.spot_id = v_spot.id
  on conflict do nothing;

  -- 품목 지정이 이미 있는 지출에는 새 사람도 전 품목에 넣어 둔다. 지정이 곧 대상 인원이라
  -- (수정 화면이 지정에서 역산한다) 비워 두면 그 사람만 지정에서 빠져 금액이 틀어진다.
  -- 지정이 아예 없는 지출은 '전원 1/N'이므로 건드리지 않는다.
  insert into public.item_assignees (item_id, member_id, room_id)
  select i.id, v_id, v_spot.room_id
  from public.expense_items i
  join public.spot_expenses x on x.expense_id = i.expense_id and x.spot_id = v_spot.id
  where exists (select 1 from public.item_assignees a where a.item_id = i.id)
  on conflict do nothing;

  return jsonb_build_object('member_id', v_id);
end;
$$;
revoke execute on function public.spot_join(text, text) from public, anon, authenticated;
grant execute on function public.spot_join(text, text) to service_role;

-- ───────────────────────── 2. 품목 지정만 저장 ─────────────────────────

-- 지출 상세에서 '누가 뭘 먹었는지'만 바꾼다. 금액·환율·박스·대상 인원은 건드리지 않는다 —
-- 그건 save_expense의 영역이다. p_assign은 { "<item_id>": ["<member_id>", ...], ... }.
-- 빈 배열은 '지정 없음'(= 대상 인원 전원 1/N)을 뜻한다.
create function public.set_item_assignees(p_expense_id uuid, p_assign jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.expenses;
  v_room uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_e from public.expenses where id = p_expense_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  v_room := v_e.room_id;
  if public.my_member_id(v_room) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if jsonb_typeof(coalesce(p_assign, 'null')) <> 'object' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  -- 키는 이 지출의 품목이어야 한다.
  if exists (
    select 1 from jsonb_object_keys(p_assign) k
    where not exists (select 1 from public.expense_items i
                      where i.id = k::uuid and i.expense_id = p_expense_id)
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  -- 값은 이 지출의 대상 인원이어야 한다. 대상 밖 사람을 품목에 넣으면 장부가 어긋난다.
  if exists (
    select 1 from jsonb_each(p_assign) e, jsonb_array_elements_text(e.value) m
    where not exists (select 1 from public.expense_scope s
                      where s.expense_id = p_expense_id and s.member_id = m::uuid)
  ) then
    raise exception using errcode = 'P0001', message = 'MEMBER_LEFT';
  end if;

  delete from public.item_assignees a using public.expense_items i
  where a.item_id = i.id and i.expense_id = p_expense_id
    and p_assign ? i.id::text;

  insert into public.item_assignees (item_id, member_id, room_id)
  select (e.key)::uuid, m::uuid, v_room
  from jsonb_each(p_assign) e, jsonb_array_elements_text(e.value) m
  on conflict do nothing;

  update public.expenses set updated_by = auth.uid(), version = version + 1 where id = p_expense_id;
  perform public._record_history(p_expense_id, 'scope_add');
end;
$$;

revoke execute on function public.set_item_assignees(uuid, jsonb) from public, anon;
grant execute on function public.set_item_assignees(uuid, jsonb) to authenticated;

-- ───────────────────────── 3. QR 웹: 지정 전에는 메뉴를 보여주지 않는다 ─────────────────────────
--
-- 처음 QR을 찍은 사람에게 1/n로 쪼갠 메뉴를 전부 펼쳐 보여주면, 아직 아무도 고르지 않은
-- 잠정 숫자를 확정된 청구서처럼 읽게 된다. 처음에는 가게와 전체 금액만 보여주고
-- '이 지출에 참여해 정산한다'는 사실만 알린다. 메뉴 내역은 결제자가 품목마다 사람을
-- 지정한 뒤에, 그 사람에게 해당하는 것만 보여준다.
--
-- 바뀌는 것은 내려보내는 범위뿐이다 — 금액 계산(_spot_share)은 그대로다.
--   참여 전        : items 없음, my_share 없음(안내 문구만)
--   참여 후·지정 전: items 없음, my_share = 1/n
--   참여 후·지정 후: 내게 해당하는 items만, my_share = 지정 기준
create or replace function public.spot_public_view(p_token text, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_spot public.spot_settles;
  v_n int;
  v_sum bigint;
  v_me public.spot_participants;
  v_acc public.payout_accounts;
  v_assigned boolean;
begin
  select s.* into v_spot from public.spot_settles s
  join public.rooms r on r.id = s.room_id and r.deleted_at is null
  where s.token = p_token;
  if not found then return jsonb_build_object('error', 'SPOT_GONE'); end if;

  select count(*) into v_n from public.spot_participants where spot_id = v_spot.id;
  select coalesce(sum(e.krw_amount), 0) into v_sum from public.expenses e
  join public.spot_expenses x on x.expense_id = e.id and x.spot_id = v_spot.id
  where e.deleted_at is null;

  if p_member_id is not null then
    select * into v_me from public.spot_participants
    where spot_id = v_spot.id and member_id = p_member_id and is_qr;
  end if;

  -- 이 정산의 참여자가 품목에 지정돼 있는가. 하나라도 있으면 '고르기가 끝난' 상태로 본다.
  select exists (
    select 1 from public.item_assignees a
    join public.expense_items i on i.id = a.item_id
    join public.spot_expenses x on x.expense_id = i.expense_id and x.spot_id = v_spot.id
    join public.spot_participants p on p.spot_id = v_spot.id and p.member_id = a.member_id
  ) into v_assigned;

  if v_me.member_id is not null then
    select a.* into v_acc from public.payout_accounts a
    join public.room_members m on m.user_id = a.user_id
    where m.id = v_spot.payer_member_id;
    update public.spot_participants set account_revealed_at = coalesce(account_revealed_at, now())
    where spot_id = v_spot.id and member_id = p_member_id;
  end if;

  return jsonb_build_object(
    'sent', v_spot.sent_at is not null,
    'schedule_title', (select title from public.schedule_items where id = v_spot.schedule_id),
    'schedule_time', (select start_time from public.schedule_items where id = v_spot.schedule_id),
    'merchants', coalesce((select jsonb_agg(e.merchant order by e.created_at) from public.expenses e
                           join public.spot_expenses x on x.expense_id = e.id and x.spot_id = v_spot.id
                           where e.deleted_at is null), '[]'),
    'paid_local_date', (select min(e.paid_local_date) from public.expenses e
                        join public.spot_expenses x on x.expense_id = e.id and x.spot_id = v_spot.id),
    'currency', (select e.currency from public.expenses e
                 join public.spot_expenses x on x.expense_id = e.id and x.spot_id = v_spot.id limit 1),
    'amount_original', (select sum(e.amount_original) from public.expenses e
                        join public.spot_expenses x on x.expense_id = e.id and x.spot_id = v_spot.id),
    'total_krw', v_sum,
    'people', case when v_me.member_id is null then v_n + 1 else v_n end,
    'joined', v_me.member_id is not null,
    -- 참여했고 지정까지 끝났을 때만, 그 사람에게 해당하는 품목만 내려보낸다.
    'items', case when v_me.member_id is null or not v_assigned then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('name',
               coalesce(nullif(btrim(coalesce(i.name_ko, '')), ''), i.name_original),
               'krw', i.krw_amount, 'mine', true) order by i.position)
      from public.expense_items i
      join public.spot_expenses x on x.expense_id = i.expense_id and x.spot_id = v_spot.id
      where i.krw_amount is not null
        and (exists (select 1 from public.item_assignees a
                     where a.item_id = i.id and a.member_id = v_me.member_id)
          or not exists (select 1 from public.item_assignees a
                         join public.spot_participants p2
                           on p2.spot_id = v_spot.id and p2.member_id = a.member_id
                         where a.item_id = i.id))), '[]') end,
    'initials', coalesce((select jsonb_agg(left(coalesce(pr.nickname, m.guest_name, '?'), 1) order by p.joined_at)
                          from public.spot_participants p
                          join public.room_members m on m.id = p.member_id
                          left join public.profiles pr on pr.id = m.user_id
                          where p.spot_id = v_spot.id), '[]'),
    'payer_name', (select coalesce(pr.nickname, m.guest_name) from public.room_members m
                   left join public.profiles pr on pr.id = m.user_id where m.id = v_spot.payer_member_id),
    'host_name', (select nickname from public.profiles where id = v_spot.created_by),
    -- 참여 전에는 금액을 앞세우지 않는다. 참여하면 그때 자기 몫이 나온다.
    'my_share', case when v_me.member_id is null then null
                     else public._spot_share(v_spot.id, v_me.member_id) end,
    'my_name', (select guest_name from public.room_members where id = v_me.member_id),
    'reported', v_me.reported_at is not null,
    'confirmed', exists (select 1 from public.transfers t
                         where t.id = v_me.transfer_id and t.voided_at is null),
    'account', case when v_acc.user_id is null then null else jsonb_build_object(
      'bank_name', v_acc.bank_name, 'holder_name', v_acc.holder_name,
      'number', extensions.pgp_sym_decrypt(v_acc.account_enc, public._payout_key())) end);
end;
$$;
revoke execute on function public.spot_public_view(text, uuid) from public, anon, authenticated;
grant execute on function public.spot_public_view(text, uuid) to service_role;
