-- 이 자리 정산: 내가 만든 '나만 보기' 지출도 나눌 수 있게 한다.
--
-- 처음에는 visibility = 'shared'만 대상으로 삼았는데, 그러면 이 기능의 주 용도가 막힌다 —
-- 혼자 계산한 지출은 save_expense가 '내가 결제 + 대상이 나뿐'이라는 이유로 private으로 잡기
-- 때문이다(20261102000000). "내가 낸 걸 이 자리 사람들과 나눈다"가 정확히 그 상태에서 시작한다.
--
-- 대상 판정은 my_expense_shares와 같은 규칙으로 맞춘다: 공동 지출 + 내가 만든 나만 보기.
-- 남의 나만 보기 지출은 여전히 보이지도, 고를 수도 없다.
--
-- 그리고 보낼 때 그 지출을 shared로 바꾼다. 대상 인원이 2명 이상이 된 뒤에도 private으로 두면
-- **남이 못 보는 지출을 남이 분담하는** 상태가 된다. save_expense의 판정 규칙과도 어긋난다
-- (private은 '내가 결제 + 대상이 나뿐'일 때만).

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
        and e.payer_kind = 'member'
        and (e.visibility = 'shared' or e.created_by = (select auth.uid()))), '[]'),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', p.member_id, 'is_qr', p.is_qr, 'reported_at', p.reported_at,
               'confirmed', exists (select 1 from public.transfers t
                                    where t.id = p.transfer_id and t.voided_at is null)) order by p.joined_at)
      from public.spot_participants p where p.spot_id = p_spot.id), '[]'));
$$;
revoke execute on function public._spot_payload(public.spot_settles) from public, anon, authenticated;

create or replace function public.open_spot_settle(p_schedule_id uuid) returns jsonb
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

  -- 결제자는 이 일정에 붙은 첫 지출의 결제자. 공금 결제는 이 자리 정산 대상이 아니다
  -- (결제자 개인 계좌로 받는 흐름과 맞지 않는다).
  select e.payer_member_id into v_payer
  from public.expenses e
  where e.schedule_id = p_schedule_id and e.deleted_at is null
    and e.payer_kind = 'member' and (e.visibility = 'shared' or e.created_by = auth.uid())
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
    and e.payer_kind = 'member' and (e.visibility = 'shared' or e.created_by = auth.uid())
    and e.payer_member_id = v_payer
  order by e.paid_local_time nulls last, e.created_at limit 1;

  insert into public.spot_participants (spot_id, member_id, room_id)
  select v_spot.id, m, v_item.room_id from unnest(array[v_me, v_payer]) m
  on conflict do nothing;

  return public._spot_payload(v_spot);
end;
$$;
revoke execute on function public.open_spot_settle(uuid) from public, anon;
grant execute on function public.open_spot_settle(uuid) to authenticated;

create or replace function public.send_spot_settle(p_spot_id uuid, p_expense_ids uuid[], p_member_ids uuid[]) returns jsonb
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
    and e.payer_kind = 'member' and (e.visibility = 'shared' or e.created_by = auth.uid());
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
  -- 대상이 2명 이상이 됐으므로 '나만 보기'는 더 이상 성립하지 않는다 — 공동으로 바꾼다.
  -- 그러지 않으면 남이 못 보는 지출을 남이 분담하게 된다.
  foreach v_e in array v_ex loop
    delete from public.expense_scope where expense_id = v_e;
    insert into public.expense_scope (expense_id, member_id, room_id)
    select v_e, x, v_spot.room_id from unnest(v_mem) x;
    update public.expenses
    set visibility = 'shared', updated_by = auth.uid(), version = version + 1
    where id = v_e;
    perform public._record_history(v_e, 'scope_add');
  end loop;

  return public._spot_payload((select s from public.spot_settles s where s.id = p_spot_id));
end;
$$;
revoke execute on function public.send_spot_settle(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.send_spot_settle(uuid, uuid[], uuid[]) to authenticated;
