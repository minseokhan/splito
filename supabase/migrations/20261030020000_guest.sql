-- 게스트 참여자 RPC (ARCHITECTURE §3 게스트 규칙·§5.1, PRD §7.2, ADR-011)
-- 누구나(활성 멤버) 호출. 게스트는 계정 전환·송금 당사자 불가 — 정산은 room_balances가 대표자에게 합산한다.

-- 대표자 검증: 같은 방의 활성 user 참여자. 나갔으면 MEMBER_LEFT, 그 외 INVALID_INPUT.
create function public._check_guest_rep(p_room_id uuid, p_rep uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_rep public.room_members;
begin
  select * into v_rep from public.room_members where id = p_rep and room_id = p_room_id and kind = 'user';
  if not found then raise exception using errcode = 'P0001', message = 'INVALID_INPUT'; end if;
  if v_rep.left_at is not null then raise exception using errcode = 'P0001', message = 'MEMBER_LEFT'; end if;
end;
$$;

-- 잠금 후 게스트 행. 게스트가 아니거나 호출자가 그 방 활성 멤버가 아니면 FORBIDDEN.
create function public._lock_guest(p_member_id uuid) returns public.room_members
language plpgsql set search_path = '' as $$
declare
  v_g public.room_members;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_g from public.room_members where id = p_member_id;
  perform 1 from public.rooms where id = v_g.room_id and deleted_at is null for update;
  select * into v_g from public.room_members where id = p_member_id;  -- 잠금 후 다시 읽는다
  if v_g.kind is distinct from 'guest' or public.my_member_id(v_g.room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  return v_g;
end;
$$;

create function public.add_guest(p_room_id uuid, p_name text, p_representative_member_id uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  v_rep uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  perform 1 from public.rooms where id = p_room_id and deleted_at is null for update;
  v_me := public.my_member_id(p_room_id);
  if v_me is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 12 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  v_rep := coalesce(p_representative_member_id, v_me);
  perform public._check_guest_rep(p_room_id, v_rep);

  insert into public.room_members (room_id, kind, guest_name, representative_member_id, created_by)
  values (p_room_id, 'guest', btrim(p_name), v_rep, auth.uid())
  returning id into v_id;
  insert into public.room_events (room_id, kind, actor_id, target_member_id, payload)
  values (p_room_id, 'guest_added', auth.uid(), v_id, jsonb_build_object('name', btrim(p_name), 'representative_member_id', v_rep));
  return v_id;
end;
$$;

-- NULL 인자는 그대로 둔다.
create function public.update_guest(p_member_id uuid, p_name text default null, p_representative_member_id uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_g public.room_members := public._lock_guest(p_member_id);
begin
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 12 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if p_representative_member_id is not null and p_representative_member_id <> v_g.representative_member_id then
    perform public._check_guest_rep(v_g.room_id, p_representative_member_id);
    insert into public.room_events (room_id, kind, actor_id, target_member_id, payload)
    values (v_g.room_id, 'guest_rep_change', auth.uid(), v_g.id,
            jsonb_build_object('from', v_g.representative_member_id, 'to', p_representative_member_id));
  end if;

  update public.room_members
  set guest_name = coalesce(btrim(p_name), guest_name),
      representative_member_id = coalesce(p_representative_member_id, representative_member_id)
  where id = p_member_id;
end;
$$;

-- 장부(결제자·대상 인원·박스 지정·공금 입금, 삭제된 지출 포함)에 참조가 없을 때만 하드 삭제.
create function public.remove_guest(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_g public.room_members := public._lock_guest(p_member_id);
begin
  if exists (select 1 from public.expenses where payer_member_id = v_g.id)
     or exists (select 1 from public.expense_scope where member_id = v_g.id)
     or exists (select 1 from public.item_assignees where member_id = v_g.id)
     or exists (select 1 from public.pool_deposits where member_id = v_g.id) then
    raise exception using errcode = 'P0001', message = 'GUEST_IN_USE';
  end if;
  -- 방 활동은 남기고 FK만 끊는다(guest_added payload에 이름이 있다)
  update public.room_events set target_member_id = null where target_member_id = v_g.id;
  delete from public.room_members where id = v_g.id;
end;
$$;

revoke execute on function public._check_guest_rep(uuid, uuid), public._lock_guest(uuid) from public, anon, authenticated;
revoke execute on function public.add_guest(uuid, text, uuid), public.update_guest(uuid, text, uuid),
  public.remove_guest(uuid) from public, anon;
grant execute on function public.add_guest(uuid, text, uuid), public.update_guest(uuid, text, uuid),
  public.remove_guest(uuid) to authenticated;
