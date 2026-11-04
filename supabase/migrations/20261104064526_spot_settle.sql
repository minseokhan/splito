-- 이 자리 정산 (QR 즉석 정산). 패키지 일정 카드에서 한 자리의 지출을 그 자리에서 나눈다.
--
-- 장부 설계 — 새 정산 엔진을 만들지 않는다:
--   동행·게스트 몫은 expense_scope에 그대로 들어가 여행 정산(room_balances)에 합쳐진다.
--   QR로 들어온 사람은 room_members(kind='guest', representative_member_id = 결제자)로 넣는다.
--   게스트는 20261102165251(게스트 분리 정산)부터 자기 순잔액을 갖는 1급 정산 당사자이고,
--   대표자가 그 게스트를 대신해 송금을 기록·확인한다(_acts_for). QR 참여자의 대표자를 결제자로
--   두는 이유가 이것이다 — 결제자가 [받았어요]를 누르면 record_transfer가 '받는 쪽이 기록했다'로
--   보고 바로 확정 처리하고, 그 사람 순잔액이 0이 된다.
--   → room_balances 수정 0줄, sum(net) = 0 불변식 그대로.
--
--   명세는 "QR 참여자 몫은 여행 정산에 넣지 않는다"고 적었지만, 받기 전까지는 실제로 받을 돈이다.
--   숨기면 조용히 사라지므로 장부에는 남기고, 결제자가 확인하면 송금으로 닫는다.
--
-- 아래 세 테이블은 '정산 단위'와 'QR 송금 상태'만 들고 있다. 금액은 하나도 저장하지 않는다.
-- RLS는 켜고 정책은 두지 않는다 — 모든 읽기·쓰기가 security definer RPC를 지난다
-- (ai_usage·payout_reveals와 같은 방식).

create table public.spot_settles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  schedule_id uuid not null unique,            -- 일정 카드 1개 = 정산 1개
  payer_member_id uuid not null,
  token text not null unique,                  -- QR 주소 /s/{token}. 22자 base64url
  sent_at timestamptz,                         -- null이면 작성 중(draft)
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (schedule_id, room_id) references public.schedule_items (id, room_id) on delete cascade,
  foreign key (payer_member_id, room_id) references public.room_members (id, room_id)
);

create table public.spot_expenses (
  spot_id uuid not null references public.spot_settles (id) on delete cascade,
  expense_id uuid not null,
  room_id uuid not null,
  primary key (spot_id, expense_id),
  foreign key (expense_id, room_id) references public.expenses (id, room_id)
);

-- 이 정산에 함께한 사람. 동행·게스트도 여기 둔다 — 보내기 전에도 QR 웹이 인원과 1인 금액을
-- 보여줘야 하는데 expense_scope는 보낸 뒤에야 쓰이기 때문이다.
create table public.spot_participants (
  spot_id uuid not null references public.spot_settles (id) on delete cascade,
  member_id uuid not null,
  room_id uuid not null,
  is_qr boolean not null default false,        -- QR로 들어온 사람(= 결제자에게 직접 송금)
  reported_at timestamptz,                     -- 상대가 '송금했어요'(알림일 뿐, 확정 아님)
  transfer_id uuid references public.transfers (id),  -- 결제자가 '받았어요'로 확정한 송금
  account_revealed_at timestamptz,             -- 결제자 계좌 원문을 보여준 시각(감사용)
  joined_at timestamptz not null default now(),
  primary key (spot_id, member_id),
  foreign key (member_id, room_id) references public.room_members (id, room_id)
);
create index spot_participants_member_idx on public.spot_participants (member_id);

alter table public.spot_settles enable row level security;
alter table public.spot_expenses enable row level security;
alter table public.spot_participants enable row level security;

-- QR 참여자 수 상한. 토큰을 아는 사람이 게스트를 무한히 만들지 못하게 막는다.
create function public._spot_qr_limit() returns int language sql immutable set search_path = '' as $$ select 20 $$;

-- 1인 금액. room_balances·my_expense_shares와 같은 규칙으로 박스마다 floor 한다.
-- 자투리는 결제자가 지므로 여기에는 들어가지 않는다(결제자 몫은 장부가 따로 계산한다).
create function public._spot_share(p_spot_id uuid) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(sum(div(i.krw_amount, greatest(
           (select count(*) from public.spot_participants where spot_id = p_spot_id), 1))), 0)::bigint
  from public.expense_items i
  join public.spot_expenses x on x.expense_id = i.expense_id and x.spot_id = p_spot_id
  where i.krw_amount is not null;
$$;

-- ───────────────────────── 읽기 ─────────────────────────

-- 시트 한 장에 필요한 전부. 금액은 계산하지 않고 박스 원화를 그대로 내려보낸다 —
-- 1인 금액은 클라이언트가 src/lib/spotSettle.ts에서 장부와 같은 규칙으로 접는다.
create function public._spot_payload(p_spot public.spot_settles) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_spot.id,
    'room_id', p_spot.room_id,
    'schedule_id', p_spot.schedule_id,
    'schedule_title', (select title from public.schedule_items where id = p_spot.schedule_id),
    'schedule_time', (select start_time from public.schedule_items where id = p_spot.schedule_id),
    'payer_member_id', p_spot.payer_member_id,
    'token', p_spot.token,
    'sent_at', p_spot.sent_at,
    -- QR 참여자에게 보여줄 계좌가 있는지. 없으면 보내기 전에 등록을 유도한다(명세 §7)
    'payer_has_account', exists (
      select 1 from public.room_members m join public.payout_accounts a on a.user_id = m.user_id
      where m.id = p_spot.payer_member_id),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'merchant', e.merchant, 'payer_member_id', e.payer_member_id,
               'krw_amount', coalesce(e.krw_amount, 0), 'currency', e.currency,
               'amount_original', e.amount_original,
               'selected', exists (select 1 from public.spot_expenses x
                                   where x.spot_id = p_spot.id and x.expense_id = e.id),
               'boxes', coalesce((select jsonb_agg(i.krw_amount order by i.position)
                                  from public.expense_items i
                                  where i.expense_id = e.id and i.krw_amount is not null), '[]'))
             order by e.paid_local_time nulls last, e.created_at)
      from public.expenses e
      where e.schedule_id = p_spot.schedule_id and e.deleted_at is null
        and e.payer_kind = 'member' and e.visibility = 'shared'), '[]'),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', p.member_id, 'is_qr', p.is_qr, 'reported_at', p.reported_at,
               'confirmed', exists (select 1 from public.transfers t
                                    where t.id = p.transfer_id and t.voided_at is null)) order by p.joined_at)
      from public.spot_participants p where p.spot_id = p_spot.id), '[]'));
$$;

-- 일정 카드가 쓰는 요약. 방의 모든 정산을 한 번에 준다(카드마다 호출하지 않는다).
create function public.room_spot_settles(p_room_id uuid) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  return query select public._spot_payload(s) from public.spot_settles s where s.room_id = p_room_id;
end;
$$;

-- ───────────────────────── 열기 ─────────────────────────

-- 시트를 열 때. 없으면 만들고(결제자 = 첫 지출의 결제자, 참여자 = 나 + 결제자) 있으면 그대로 준다.
-- 토큰을 여기서 발급하는 이유: 보내기 전에도 QR을 보여줘야 한다.
create function public.open_spot_settle(p_schedule_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.schedule_items;
  v_me uuid;
  v_payer uuid;
  v_spot public.spot_settles;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_item from public.schedule_items where id = p_schedule_id;
  if not found then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  perform 1 from public.rooms where id = v_item.room_id and deleted_at is null for update;
  v_me := public.my_member_id(v_item.room_id);
  if v_me is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  select * into v_spot from public.spot_settles where schedule_id = p_schedule_id;
  if found then return public._spot_payload(v_spot); end if;

  -- 결제자는 이 일정에 붙은 첫 지출의 결제자. 공금 결제·나만 보기는 이 자리 정산 대상이 아니다.
  select e.payer_member_id into v_payer
  from public.expenses e
  where e.schedule_id = p_schedule_id and e.deleted_at is null
    and e.payer_kind = 'member' and e.visibility = 'shared'
  order by e.paid_local_time nulls last, e.created_at
  limit 1;
  if v_payer is null then raise exception using errcode = 'P0001', message = 'NO_EXPENSE'; end if;

  insert into public.spot_settles (room_id, schedule_id, payer_member_id, token, created_by)
  values (v_item.room_id, p_schedule_id, v_payer, public.new_invite_token(), auth.uid())
  returning * into v_spot;

  -- 처음 선택: 첫 지출 1건, 나 + 결제자
  insert into public.spot_expenses (spot_id, expense_id, room_id)
  select v_spot.id, e.id, v_item.room_id from public.expenses e
  where e.schedule_id = p_schedule_id and e.deleted_at is null
    and e.payer_kind = 'member' and e.visibility = 'shared' and e.payer_member_id = v_payer
  order by e.paid_local_time nulls last, e.created_at limit 1;

  insert into public.spot_participants (spot_id, member_id, room_id)
  select v_spot.id, m, v_item.room_id from unnest(array[v_me, v_payer]) m
  on conflict do nothing;

  return public._spot_payload(v_spot);
end;
$$;

-- ───────────────────────── 보내기 ─────────────────────────

-- 선택을 확정하고 장부에 반영한다. 고른 지출들의 대상 인원을 고른 사람으로 바꾼다.
-- 금액·환율·박스는 건드리지 않는다 — save_expense의 영역이다.
create function public.send_spot_settle(p_spot_id uuid, p_expense_ids uuid[], p_member_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_spot public.spot_settles;
  v_ex uuid[] := array(select distinct x from unnest(coalesce(p_expense_ids, '{}')) x);
  v_mem uuid[] := array(select distinct x from unnest(coalesce(p_member_ids, '{}')) x);
  v_payers uuid[];
  v_payer uuid;
  v_found int;
  v_e uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_spot from public.spot_settles where id = p_spot_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  perform 1 from public.rooms where id = v_spot.room_id and deleted_at is null for update;
  if public.my_member_id(v_spot.room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if cardinality(v_ex) = 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if cardinality(v_mem) < 2 then
    raise exception using errcode = 'P0001', message = 'SPOT_TOO_FEW';
  end if;

  -- 고른 지출은 전부 이 일정의 유효한 지출이고, 결제자가 한 명이어야 한다(명세 §2-2).
  select count(*), array_agg(distinct e.payer_member_id) into v_found, v_payers
  from public.expenses e
  where e.id = any (v_ex) and e.schedule_id = v_spot.schedule_id and e.deleted_at is null
    and e.payer_kind = 'member' and e.visibility = 'shared';
  if v_found <> cardinality(v_ex) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if cardinality(v_payers) <> 1 then
    raise exception using errcode = 'P0001', message = 'SPOT_MIXED_PAYER';
  end if;
  v_payer := v_payers[1];

  -- 고른 사람은 전부 이 방의 활성 참여자여야 한다. 결제자는 반드시 들어간다.
  if exists (select 1 from unnest(v_mem) x
             where not exists (select 1 from public.room_members m
                               where m.id = x and m.room_id = v_spot.room_id and m.left_at is null)) then
    raise exception using errcode = 'P0001', message = 'MEMBER_LEFT';
  end if;
  if not (v_payer = any (v_mem)) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  -- 이미 송금을 확인한 QR 참여자는 뺄 수 없다(명세 §7: 송금 확인 이후에는 수정 잠금).
  if exists (select 1 from public.spot_participants p
             join public.transfers t on t.id = p.transfer_id and t.voided_at is null
             where p.spot_id = p_spot_id and not (p.member_id = any (v_mem))) then
    raise exception using errcode = 'P0001', message = 'SPOT_LOCKED';
  end if;

  update public.spot_settles set payer_member_id = v_payer, sent_at = coalesce(sent_at, now())
  where id = p_spot_id;

  delete from public.spot_expenses where spot_id = p_spot_id and not (expense_id = any (v_ex));
  insert into public.spot_expenses (spot_id, expense_id, room_id)
  select p_spot_id, x, v_spot.room_id from unnest(v_ex) x
  on conflict do nothing;

  -- QR 참여자는 지우지 않는다 — 이미 들어와 있는 사람을 빼는 건 명시적 선택 해제로만 한다.
  delete from public.spot_participants where spot_id = p_spot_id and not (member_id = any (v_mem));
  insert into public.spot_participants (spot_id, member_id, room_id)
  select p_spot_id, x, v_spot.room_id from unnest(v_mem) x
  on conflict do nothing;

  -- 장부 반영: 고른 지출의 대상 인원을 고른 사람으로 바꾼다.
  foreach v_e in array v_ex loop
    delete from public.expense_scope where expense_id = v_e;
    insert into public.expense_scope (expense_id, member_id, room_id)
    select v_e, x, v_spot.room_id from unnest(v_mem) x;
    update public.expenses set updated_by = auth.uid(), version = version + 1 where id = v_e;
    perform public._record_history(v_e, 'scope_add');
  end loop;

  return public._spot_payload((select s from public.spot_settles s where s.id = p_spot_id));
end;
$$;

-- 결제자가 QR 참여자의 송금을 확인/취소한다. 확인은 실제 송금 기록으로 남는다 —
-- 받는 쪽(결제자)이 기록하는 것이므로 record_transfer가 바로 확정 처리하고 그 사람 순잔액이 0이 된다.
create function public.confirm_spot_transfer(p_spot_id uuid, p_member_id uuid, p_confirmed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_spot public.spot_settles;
  v_p public.spot_participants;
  v_share bigint;
  v_tid uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_spot from public.spot_settles where id = p_spot_id;
  -- 확인은 받는 사람(결제자)만 한다.
  if not found or public.my_member_id(v_spot.room_id) is distinct from v_spot.payer_member_id then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  select * into v_p from public.spot_participants
  where spot_id = p_spot_id and member_id = p_member_id and is_qr for update;
  if not found then raise exception using errcode = 'P0001', message = 'INVALID_INPUT'; end if;

  if p_confirmed then
    if v_p.transfer_id is not null
       and exists (select 1 from public.transfers where id = v_p.transfer_id and voided_at is null) then
      return;  -- 이미 확인함(멱등)
    end if;
    v_share := public._spot_share(p_spot_id);
    if v_share <= 0 then raise exception using errcode = 'P0001', message = 'AMOUNT_INVALID'; end if;
    v_tid := gen_random_uuid();
    perform public.record_transfer(v_tid, v_spot.room_id, p_member_id, v_spot.payer_member_id, v_share);
    update public.spot_participants set transfer_id = v_tid
    where spot_id = p_spot_id and member_id = p_member_id;
  elsif v_p.transfer_id is not null then
    -- 되돌리기는 받는 쪽의 '안 받았어요'다. cancel_transfer는 보내는 쪽 것이라 확정된 송금을 못 지운다.
    perform public.reject_transfer(v_p.transfer_id);
    update public.spot_participants set transfer_id = null
    where spot_id = p_spot_id and member_id = p_member_id;
  end if;
end;
$$;

-- ───────────────────────── QR 웹(서비스 롤 전용) ─────────────────────────
-- 아래 셋은 Edge Function이 service_role로만 호출한다. anon·authenticated에는 주지 않는다.

-- 토큰으로 보는 공개 화면. 이 정산 하나만 보이고 여행 장부는 보이지 않는다.
-- 계좌 원문은 '참여를 마친 그 사람'에게만 준다(명세 §5 + 보안 결정 ⓑ).
create function public.spot_public_view(p_token text, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_spot public.spot_settles;
  v_n int;
  v_sum bigint;
  v_share bigint;
  v_me public.spot_participants;
  v_acc public.payout_accounts;
begin
  select * into v_spot from public.spot_settles s
  join public.rooms r on r.id = s.room_id and r.deleted_at is null
  where s.token = p_token;
  if not found then return jsonb_build_object('error', 'SPOT_GONE'); end if;

  select count(*) into v_n from public.spot_participants where spot_id = v_spot.id;
  select coalesce(sum(e.krw_amount), 0) into v_sum from public.expenses e
  join public.spot_expenses x on x.expense_id = e.id and x.spot_id = v_spot.id
  where e.deleted_at is null;
  v_share := public._spot_share(v_spot.id);

  if p_member_id is not null then
    select * into v_me from public.spot_participants
    where spot_id = v_spot.id and member_id = p_member_id and is_qr;
  end if;

  if v_me.member_id is not null then
    select a.* into v_acc from public.payout_accounts a
    join public.room_members m on m.user_id = a.user_id
    where m.id = v_spot.payer_member_id;
    -- 계좌 원문을 보여준 사실을 남긴다(감사용). 처음 한 번만 기록한다.
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
    'people', v_n,
    'initials', coalesce((select jsonb_agg(left(coalesce(pr.nickname, m.guest_name, '?'), 1) order by p.joined_at)
                          from public.spot_participants p
                          join public.room_members m on m.id = p.member_id
                          left join public.profiles pr on pr.id = m.user_id
                          where p.spot_id = v_spot.id), '[]'),
    'payer_name', (select coalesce(pr.nickname, m.guest_name) from public.room_members m
                   left join public.profiles pr on pr.id = m.user_id where m.id = v_spot.payer_member_id),
    'host_name', (select nickname from public.profiles where id = v_spot.created_by),
    'my_share', case when v_me.member_id is null then null else v_share end,
    'my_name', (select guest_name from public.room_members where id = v_me.member_id),
    'reported', v_me.reported_at is not null,
    'confirmed', exists (select 1 from public.transfers t
                         where t.id = v_me.transfer_id and t.voided_at is null),
    'account', case when v_acc.user_id is null then null else jsonb_build_object(
      'bank_name', v_acc.bank_name, 'holder_name', v_acc.holder_name,
      'number', extensions.pgp_sym_decrypt(v_acc.account_enc, public._payout_key())) end);
end;
$$;

-- QR을 찍은 사람이 이름만 넣고 들어온다. 계정도 앱도 필요 없다.
create function public.spot_join(p_token text, p_name text) returns jsonb
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

  -- QR 참여자는 '대표자 = 결제자'인 게스트다. 그래야 room_balances가 그 몫을 결제자에게 합산해
  -- 여행 정산에서 빠지고, 결제자에게 직접 송금하는 모양이 된다.
  insert into public.room_members (room_id, kind, guest_name, representative_member_id, created_by)
  values (v_spot.room_id, 'guest', v_name, v_spot.payer_member_id, v_spot.created_by)
  returning id into v_id;
  insert into public.spot_participants (spot_id, member_id, room_id, is_qr)
  values (v_spot.id, v_id, v_spot.room_id, true);

  -- 이미 보낸 뒤에 들어온 사람도 장부에 들어가야 한다.
  if v_spot.sent_at is not null then
    insert into public.expense_scope (expense_id, member_id, room_id)
    select x.expense_id, v_id, v_spot.room_id from public.spot_expenses x where x.spot_id = v_spot.id
    on conflict do nothing;
  end if;

  return jsonb_build_object('member_id', v_id);
end;
$$;

create function public.spot_report(p_token text, p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_spot public.spot_settles;
begin
  select s.* into v_spot from public.spot_settles s where s.token = p_token;
  if not found then return jsonb_build_object('error', 'SPOT_GONE'); end if;
  update public.spot_participants set reported_at = coalesce(reported_at, now())
  where spot_id = v_spot.id and member_id = p_member_id and is_qr;
  if not found then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ───────────────────────── 권한 ─────────────────────────

revoke execute on function public._spot_payload(public.spot_settles), public._spot_qr_limit(),
  public._spot_share(uuid) from public, anon, authenticated;
revoke execute on function public.room_spot_settles(uuid), public.open_spot_settle(uuid),
  public.send_spot_settle(uuid, uuid[], uuid[]), public.confirm_spot_transfer(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.room_spot_settles(uuid), public.open_spot_settle(uuid),
  public.send_spot_settle(uuid, uuid[], uuid[]), public.confirm_spot_transfer(uuid, uuid, boolean)
  to authenticated;

-- 공개 웹 3종은 Edge Function(service_role)만 부른다. 앱 사용자에게도 주지 않는다.
revoke execute on function public.spot_public_view(text, uuid), public.spot_join(text, text),
  public.spot_report(text, uuid) from public, anon, authenticated;
grant execute on function public.spot_public_view(text, uuid), public.spot_join(text, text),
  public.spot_report(text, uuid) to service_role;
