-- QR로 들어온 사람은 '그 한 자리'의 사람이지 여행의 동행이 아니다.
--
-- room_members 행은 있어야 한다 — expense_scope와 transfers가 member_id를 요구하고,
-- 그래야 1인 금액(1/n)과 순잔액이 맞는다. 하지만 행이 있다는 이유로 지금은
-- 참여자 팝오버·품목별 지정·대표자 후보 같은 '사람 고르는 목록'에 전부 끼어든다.
--
-- 그래서 표시용 구분을 하나 둔다. 장부에는 그대로 두고(받을 돈이 사라지면 안 된다),
-- 화면에서 '고르는 자리'만 이 값으로 거른다.
--
-- my_rooms.member_count는 건드리지 않는다. 그 값은 '정산 당사자가 2명 이상인가'를 뜻하고
-- (정산 화면을 여는 기준), QR 참여자는 실제로 돈을 주고받는 당사자다.

alter table public.room_members
  add column spot_only boolean not null default false;

comment on column public.room_members.spot_only is
  '이 자리 정산(QR)으로만 들어온 사람. 장부에는 들어가지만 동행 목록·사람 고르기에는 안 뜬다.';

-- spot_join이 만드는 게스트에 표시를 남긴다. 나머지는 20261104070954 정의 그대로.
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

  -- 이미 보낸 뒤에 들어온 사람도 장부에 들어가야 한다.
  if v_spot.sent_at is not null then
    insert into public.expense_scope (expense_id, member_id, room_id)
    select x.expense_id, v_id, v_spot.room_id from public.spot_expenses x where x.spot_id = v_spot.id
    on conflict do nothing;
  end if;

  return jsonb_build_object('member_id', v_id);
end;
$$;
revoke execute on function public.spot_join(text, text) from public, anon, authenticated;
grant execute on function public.spot_join(text, text) to service_role;

-- 공개 화면의 '내 몫'은 아직 참여하지 않은 사람에게도 보여야 한다(시안 join 단계).
-- 참여 전에는 자기 자신을 더한 인원으로 미리 계산한다 — 참여하면 그 값이 그대로 자기 몫이 된다.
--
-- 인자가 늘어나므로 create or replace로는 교체가 안 된다 — 오버로드가 하나 더 생겨
-- _spot_share(uuid) 호출이 모호해진다. 옛 시그니처를 먼저 지운다.
drop function public._spot_share(uuid);
create function public._spot_share(p_spot_id uuid, p_extra int default 0) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(sum(div(i.krw_amount, greatest(
           (select count(*) from public.spot_participants where spot_id = p_spot_id) + p_extra, 1))), 0)::bigint
  from public.expense_items i
  join public.spot_expenses x on x.expense_id = i.expense_id and x.spot_id = p_spot_id
  where i.krw_amount is not null;
$$;
revoke execute on function public._spot_share(uuid, int) from public, anon, authenticated;

create or replace function public.spot_public_view(p_token text, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_spot public.spot_settles;
  v_n int;
  v_sum bigint;
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

  if p_member_id is not null then
    select * into v_me from public.spot_participants
    where spot_id = v_spot.id and member_id = p_member_id and is_qr;
  end if;

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
    -- 참여 전에는 '내가 들어가면 이렇게 된다'를 보여준다. 들어온 뒤에는 실제 인원.
    'people', case when v_me.member_id is null then v_n + 1 else v_n end,
    'joined', v_me.member_id is not null,
    'initials', coalesce((select jsonb_agg(left(coalesce(pr.nickname, m.guest_name, '?'), 1) order by p.joined_at)
                          from public.spot_participants p
                          join public.room_members m on m.id = p.member_id
                          left join public.profiles pr on pr.id = m.user_id
                          where p.spot_id = v_spot.id), '[]'),
    'payer_name', (select coalesce(pr.nickname, m.guest_name) from public.room_members m
                   left join public.profiles pr on pr.id = m.user_id where m.id = v_spot.payer_member_id),
    'host_name', (select nickname from public.profiles where id = v_spot.created_by),
    'my_share', public._spot_share(v_spot.id, case when v_me.member_id is null then 1 else 0 end),
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
