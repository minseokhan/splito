-- 송금 기록·확인·무효와 방 나가기 (ARCHITECTURE §5.1, PRD §6 F8·§7.2·§7.3, ADR-007)
-- 송금은 장부 기록일 뿐 실제 이체는 하지 않는다. 무효는 voided_at·void_reason으로만(하드 삭제 금지).

create function public.record_transfer(p_id uuid, p_room_id uuid, p_from_member_id uuid, p_to_member_id uuid, p_amount_krw bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  v_n int;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  perform 1 from public.rooms where id = p_room_id and deleted_at is null for update;
  v_me := public.my_member_id(p_room_id);  -- 삭제된 방·비멤버면 NULL
  if v_me is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  if exists (select 1 from public.transfers where id = p_id) then return; end if;  -- 재전송 멱등

  if p_from_member_id is not distinct from p_to_member_id then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if coalesce(p_amount_krw, 0) <= 0 then raise exception using errcode = 'P0001', message = 'AMOUNT_INVALID'; end if;
  -- 당사자는 이 방의 user 참여자(게스트는 대표자에게 합산되므로 불가)
  select count(*) into v_n from public.room_members
  where room_id = p_room_id and kind = 'user' and id in (p_from_member_id, p_to_member_id);
  if v_n <> 2 then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if exists (select 1 from public.room_members where id in (p_from_member_id, p_to_member_id) and left_at is not null) then
    raise exception using errcode = 'P0001', message = 'MEMBER_LEFT';
  end if;
  if v_me not in (p_from_member_id, p_to_member_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  -- 받는 사람이 기록하면 바로 확인
  insert into public.transfers (id, room_id, from_member_id, to_member_id, amount_krw, recorded_by, confirmed_at)
  values (p_id, p_room_id, p_from_member_id, p_to_member_id, p_amount_krw, auth.uid(),
          case when v_me = p_to_member_id then now() end);
  insert into public.room_events (room_id, kind, actor_id, payload)
  values (p_room_id, 'transfer', auth.uid(), jsonb_build_object('transfer_id', p_id, 'from_member_id', p_from_member_id,
          'to_member_id', p_to_member_id, 'amount_krw', p_amount_krw));
end;
$$;

-- 잠금 후 송금 행. 호출자가 p_side(from|to) 당사자가 아니거나 무효면 FORBIDDEN.
create function public._lock_transfer(p_id uuid, p_side text) returns public.transfers
language plpgsql set search_path = '' as $$
declare
  v_t public.transfers;
  v_party uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_t from public.transfers where id = p_id;
  perform 1 from public.rooms where id = v_t.room_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_t from public.transfers where id = p_id;  -- 잠금 후 다시 읽는다
  v_party := v_t.to_member_id;
  if p_side = 'from' then v_party := v_t.from_member_id; end if;
  if v_t.voided_at is not null or public.my_member_id(v_t.room_id) is distinct from v_party then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  return v_t;
end;
$$;

create function public.confirm_transfer(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._lock_transfer(p_id, 'to');
  update public.transfers set confirmed_at = coalesce(confirmed_at, now()) where id = p_id;
end;
$$;

create function public.reject_transfer(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._lock_transfer(p_id, 'to');
  update public.transfers set voided_at = now(), voided_by = auth.uid(), void_reason = 'not_received' where id = p_id;
end;
$$;

create function public.cancel_transfer(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.transfers := public._lock_transfer(p_id, 'from');
begin
  if v_t.confirmed_at is not null then raise exception using errcode = 'P0001', message = 'ALREADY_CONFIRMED'; end if;
  update public.transfers set voided_at = now(), voided_by = auth.uid(), void_reason = 'cancelled' where id = p_id;
end;
$$;

create function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
  v_me uuid;
  v_next public.room_members;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where id = p_room_id and deleted_at is null for update;
  v_me := public.my_member_id(p_room_id);
  if v_room.id is null or v_me is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  if exists (select 1 from public.room_members
             where room_id = p_room_id and kind = 'guest' and left_at is null and representative_member_id = v_me) then
    raise exception using errcode = 'P0001', message = 'GUEST_REPRESENTATIVE';
  end if;
  if v_room.pool_owner_member_id = v_me then raise exception using errcode = 'P0001', message = 'POOL_OWNER'; end if;
  if exists (select 1 from public.expenses where room_id = p_room_id and deleted_at is null and fx_source = 'pending') then
    raise exception using errcode = 'P0001', message = 'FX_PENDING_EXISTS';
  end if;
  if (select b.net from public.room_balances(p_room_id, true) b where b.member_id = v_me) <> 0 then
    raise exception using errcode = 'P0001', message = 'BALANCE_NOT_ZERO';
  end if;

  update public.room_members set left_at = now() where id = v_me;
  insert into public.room_events (room_id, kind, actor_id, target_member_id)
  values (p_room_id, 'leave', auth.uid(), v_me);

  select * into v_next from public.room_members
  where room_id = p_room_id and kind = 'user' and left_at is null
  order by joined_at, id limit 1;
  if v_next.id is null then
    update public.rooms set deleted_at = now() where id = p_room_id;  -- 사진 정리는 P1 작업
  elsif v_room.owner_id = auth.uid() then
    update public.rooms set owner_id = v_next.user_id where id = p_room_id;
    insert into public.room_events (room_id, kind, actor_id, target_member_id)
    values (p_room_id, 'owner_change', auth.uid(), v_next.id);
  end if;
end;
$$;

revoke execute on function public._lock_transfer(uuid, text) from public, anon, authenticated;
revoke execute on function public.record_transfer(uuid, uuid, uuid, uuid, bigint), public.confirm_transfer(uuid),
  public.reject_transfer(uuid), public.cancel_transfer(uuid), public.leave_room(uuid) from public, anon;
grant execute on function public.record_transfer(uuid, uuid, uuid, uuid, bigint), public.confirm_transfer(uuid),
  public.reject_transfer(uuid), public.cancel_transfer(uuid), public.leave_room(uuid) to authenticated;
