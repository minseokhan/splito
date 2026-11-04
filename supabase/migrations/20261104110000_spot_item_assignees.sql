-- 이 자리 정산이 품목 지정(item_assignees)까지 써 준다.
--
-- 지금까지는 expense_scope만 썼다. 그런데 앱의 지출 수정 화면은 대상 인원을 **품목 지정에서
-- 역산**한다(src/lib/expenseForm.ts effScope: 지정이 비면 '활동 참여자 전원'으로 채운다).
-- 그래서 이 자리 정산으로 4명에게 나눈 지출을 한 번이라도 수정하면 대상 인원이 방 전체로
-- 되돌아가 금액이 조용히 바뀐다. 반대로 QR 참여자를 화면에서 거르면 그 사람이 대상에서
-- 빠져 버린다 — 어느 쪽이든 돈이 틀어진다.
--
-- 지정을 명시해 두면 셋이 한 번에 풀린다:
--   · 수정해도 구성이 유지된다(지정이 곧 대상 인원이다)
--   · 지출 상세가 '함께한 사람'과 품목별 인원을 그대로 보여준다
--   · 수정 화면에서 품목마다 누가 먹었는지 고를 수 있다(QR 참여자 포함)
--
-- 품목 단위 분담 규칙은 그대로다 — room_balances의 eff는 '지정 ∩ 대상 인원'이고
-- 여기서 둘이 같으므로 결과 금액은 지금과 동일하다.

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

  if exists (select 1 from unnest(v_mem) x
             where not exists (select 1 from public.room_members m
                               where m.id = x and m.room_id = v_spot.room_id and m.left_at is null)) then
    raise exception using errcode = 'P0001', message = 'MEMBER_LEFT';
  end if;
  if not (v_payer = any (v_mem)) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

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

  delete from public.spot_participants where spot_id = p_spot_id and not (member_id = any (v_mem));
  insert into public.spot_participants (spot_id, member_id, room_id)
  select p_spot_id, x, v_spot.room_id from unnest(v_mem) x
  on conflict do nothing;

  -- 장부 반영. 대상 인원이 2명 이상이 됐으므로 '나만 보기'는 성립하지 않는다 → 공동으로 바꾼다.
  foreach v_e in array v_ex loop
    delete from public.expense_scope where expense_id = v_e;
    insert into public.expense_scope (expense_id, member_id, room_id)
    select v_e, x, v_spot.room_id from unnest(v_mem) x;

    -- 품목마다 '이 자리에 있던 사람 전원'을 지정으로 박아 둔다. 수정 화면이 대상 인원을
    -- 지정에서 역산하므로, 비워 두면 나중 수정 때 방 전체로 되돌아간다.
    delete from public.item_assignees a using public.expense_items i
      where a.item_id = i.id and i.expense_id = v_e;
    insert into public.item_assignees (item_id, member_id, room_id)
    select i.id, x, v_spot.room_id
    from public.expense_items i cross join unnest(v_mem) x
    where i.expense_id = v_e;

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

-- QR로 뒤늦게 들어온 사람도 같은 규칙을 따른다 — 대상 인원과 품목 지정 양쪽에 넣는다.
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

  insert into public.room_members (room_id, kind, guest_name, representative_member_id, created_by, spot_only)
  values (v_spot.room_id, 'guest', v_name, v_spot.payer_member_id, v_spot.created_by, true)
  returning id into v_id;
  insert into public.spot_participants (spot_id, member_id, room_id, is_qr)
  values (v_spot.id, v_id, v_spot.room_id, true);

  if v_spot.sent_at is not null then
    insert into public.expense_scope (expense_id, member_id, room_id)
    select x.expense_id, v_id, v_spot.room_id from public.spot_expenses x where x.spot_id = v_spot.id
    on conflict do nothing;
    insert into public.item_assignees (item_id, member_id, room_id)
    select i.id, v_id, v_spot.room_id
    from public.spot_expenses x join public.expense_items i on i.expense_id = x.expense_id
    where x.spot_id = v_spot.id
    on conflict do nothing;
  end if;

  return jsonb_build_object('member_id', v_id);
end;
$$;
revoke execute on function public.spot_join(text, text) from public, anon, authenticated;
grant execute on function public.spot_join(text, text) to service_role;
