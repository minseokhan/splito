-- 이 자리 정산의 '내 몫'을 품목 지정대로 계산한다.
--
-- 흐름: 영수증으로 석식 지출을 올린다 → 이 자리 정산으로 QR을 보여준다 → 모르는 사람이
-- 이름만 넣고 들어온다 → 결제자가 지출 상세에서 **메뉴마다 누가 먹었는지** 고른다 →
-- 그 사람이 웹을 새로고침하면 자기가 먹은 것만 계산된 금액이 보인다.
--
-- 지금까지 _spot_share는 참여 인원으로 1/n만 했다. 품목 지정을 바꿔도 웹 금액이 그대로라
-- 위 흐름의 마지막 단계가 성립하지 않는다.
--
-- 계산 규칙은 room_balances·my_expense_shares와 같게 맞춘다:
--   박스마다 실제 지정 인원 = 지정 ∩ 이 정산의 참여자, 비면 참여자 전원.
--   그 인원으로 floor 나눔. 자투리는 결제자가 지므로 여기엔 들어가지 않는다.

-- 인자가 바뀌므로 교체가 아니라 drop 후 재생성한다(create or replace는 오버로드를 만든다).
drop function public._spot_share(uuid, int);

create function public._spot_share(p_spot_id uuid, p_member_id uuid default null) returns bigint
language sql stable set search_path = '' as $$
  with box as (
    select i.id, i.krw_amount
    from public.expense_items i
    join public.spot_expenses x on x.expense_id = i.expense_id and x.spot_id = p_spot_id
    where i.krw_amount is not null
  ), eff as (
    -- 실제 지정 인원 = 지정 ∩ 참여자. 그 박스에 참여자 지정이 하나도 없으면 참여자 전원.
    select b.id as item_id, p.member_id
    from box b
    cross join public.spot_participants p
    where p.spot_id = p_spot_id
      and (exists (select 1 from public.item_assignees a
                   where a.item_id = b.id and a.member_id = p.member_id)
        or not exists (select 1 from public.item_assignees a
                       join public.spot_participants p2
                         on p2.spot_id = p_spot_id and p2.member_id = a.member_id
                       where a.item_id = b.id))
  ), n as (
    select item_id, count(*)::int as cnt from eff group by item_id
  )
  select case
    -- 아직 참여 전: '내가 들어가면 얼마'를 보여준다. 그때는 모든 박스를 같이 나눈다.
    when p_member_id is null then coalesce((
      select sum(div(b.krw_amount,
        (select count(*) from public.spot_participants where spot_id = p_spot_id)::int + 1))
      from box b), 0)
    else coalesce((
      select sum(div(b.krw_amount, n.cnt))
      from box b join n on n.item_id = b.id
      join eff f on f.item_id = b.id and f.member_id = p_member_id), 0)
  end::bigint;
$$;
revoke execute on function public._spot_share(uuid, uuid) from public, anon, authenticated;

-- 시트가 사람마다 실제 금액을 보여줄 수 있게 참여자에 share를 같이 내려준다.
-- (작성 중에는 화면이 즉시 다시 계산하지만, 보낸 뒤 '받았어요 ○○원'은 서버 값이 정답이다.)
create or replace function public._spot_payload(p_spot public.spot_settles) returns jsonb
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
        and e.payer_kind = 'member'
        and (e.visibility = 'shared' or e.created_by = (select auth.uid()))), '[]'),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', p.member_id, 'is_qr', p.is_qr, 'reported_at', p.reported_at,
               'share', public._spot_share(p_spot.id, p.member_id),
               'confirmed', exists (select 1 from public.transfers t
                                    where t.id = p.transfer_id and t.voided_at is null)) order by p.joined_at)
      from public.spot_participants p where p.spot_id = p_spot.id), '[]'));
$$;
revoke execute on function public._spot_payload(public.spot_settles) from public, anon, authenticated;

-- 송금 확인 금액도 그 사람의 실제 몫으로 잡는다.
create or replace function public.confirm_spot_transfer(p_spot_id uuid, p_member_id uuid, p_confirmed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_spot public.spot_settles;
  v_p public.spot_participants;
  v_share bigint;
  v_tid uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_spot from public.spot_settles where id = p_spot_id;
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
    v_share := public._spot_share(p_spot_id, p_member_id);
    if v_share <= 0 then raise exception using errcode = 'P0001', message = 'AMOUNT_INVALID'; end if;
    v_tid := gen_random_uuid();
    perform public.record_transfer(v_tid, v_spot.room_id, p_member_id, v_spot.payer_member_id, v_share);
    update public.spot_participants set transfer_id = v_tid
    where spot_id = p_spot_id and member_id = p_member_id;
  elsif v_p.transfer_id is not null then
    perform public.reject_transfer(v_p.transfer_id);
    update public.spot_participants set transfer_id = null
    where spot_id = p_spot_id and member_id = p_member_id;
  end if;
end;
$$;
revoke execute on function public.confirm_spot_transfer(uuid, uuid, boolean) from public, anon;
grant execute on function public.confirm_spot_transfer(uuid, uuid, boolean) to authenticated;

-- 공개 화면: 참여했으면 그 사람의 실제 몫, 아직이면 미리보기.
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
    'people', case when v_me.member_id is null then v_n + 1 else v_n end,
    'joined', v_me.member_id is not null,
    -- 내가 먹은 품목만. 결제자가 지출 상세에서 지정을 바꾸면 새로고침에 바로 반영된다.
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(nullif(btrim(coalesce(i.name_ko, '')), ''), i.name_original),
               'krw', i.krw_amount,
               'mine', v_me.member_id is not null and (
                 exists (select 1 from public.item_assignees a
                         where a.item_id = i.id and a.member_id = v_me.member_id)
                 or not exists (select 1 from public.item_assignees a
                                join public.spot_participants p2
                                  on p2.spot_id = v_spot.id and p2.member_id = a.member_id
                                where a.item_id = i.id)))
             order by i.position)
      from public.expense_items i
      join public.spot_expenses x on x.expense_id = i.expense_id and x.spot_id = v_spot.id
      where i.krw_amount is not null), '[]'),
    'initials', coalesce((select jsonb_agg(left(coalesce(pr.nickname, m.guest_name, '?'), 1) order by p.joined_at)
                          from public.spot_participants p
                          join public.room_members m on m.id = p.member_id
                          left join public.profiles pr on pr.id = m.user_id
                          where p.spot_id = v_spot.id), '[]'),
    'payer_name', (select coalesce(pr.nickname, m.guest_name) from public.room_members m
                   left join public.profiles pr on pr.id = m.user_id where m.id = v_spot.payer_member_id),
    'host_name', (select nickname from public.profiles where id = v_spot.created_by),
    'my_share', public._spot_share(v_spot.id, v_me.member_id),
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
