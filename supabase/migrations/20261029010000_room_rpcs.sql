-- 방 생성·초대·합류 RPC (ARCHITECTURE §4·§5.1, ADR-008)
-- 공통: security definer, search_path '', 첫 줄 auth.uid() 확인, anon 실행 회수. 실패는 P0001 + 코드.

-- 128비트 URL-safe 토큰(22자). base64 16바이트 = 22자 + '==' 패딩, translate가 '='를 지운다.
create function public.new_invite_token() returns text
language sql volatile set search_path = '' as $$
  select left(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'), 22);
$$;

create function public.create_room(p_name text, p_base_currency text, p_start_date date default null, p_end_date date default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 30
     or coalesce(p_base_currency, '') !~ '^[A-Z]{3}$'
     or p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  insert into public.rooms (name, base_currency, start_date, end_date, owner_id, invite_token)
  values (btrim(p_name), p_base_currency, p_start_date, p_end_date, auth.uid(), public.new_invite_token())
  returning id into v_room_id;

  insert into public.room_members (room_id, kind, user_id, created_by)
  values (v_room_id, 'user', auth.uid(), auth.uid());

  return v_room_id;
end;
$$;

-- 합류 확인 시트용. 없음·교체·삭제된 방 모두 INVITE_INVALID(이유 구분 금지).
create function public.preview_invite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where invite_token = p_token and deleted_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'INVITE_INVALID'; end if;

  return jsonb_build_object(
    'room_id', v_room.id,
    'room_name', v_room.name,
    'inviter_nickname', (select nickname from public.profiles where id = v_room.owner_id),
    'member_count', (select count(*) from public.room_members where room_id = v_room.id and left_at is null),
    'already_member', exists (select 1 from public.room_members
                              where room_id = v_room.id and user_id = auth.uid() and left_at is null)
  );
end;
$$;

create function public.join_room(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
  v_member public.room_members;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select id into v_room_id from public.rooms where invite_token = p_token and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'INVITE_INVALID'; end if;

  select * into v_member from public.room_members where room_id = v_room_id and user_id = auth.uid();
  if not found then
    insert into public.room_members (room_id, kind, user_id, created_by)
    values (v_room_id, 'user', auth.uid(), auth.uid())
    returning * into v_member;
    insert into public.room_events (room_id, kind, actor_id, target_member_id)
    values (v_room_id, 'join', auth.uid(), v_member.id);
  elsif v_member.left_at is not null then
    -- 재합류: 같은 참여자 ID, joined_at 유지
    update public.room_members set left_at = null, removed_by = null where id = v_member.id;
  end if;

  return v_room_id;
end;
$$;

create function public.update_room(p_room_id uuid, p_name text, p_base_currency text, p_start_date date, p_end_date date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where id = p_room_id and deleted_at is null for update;
  if not found or v_room.owner_id <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 30
     or coalesce(p_base_currency, '') !~ '^[A-Z]{3}$'
     or p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if p_base_currency <> v_room.base_currency
     and exists (select 1 from public.expenses where room_id = p_room_id and deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'CURRENCY_LOCKED';
  end if;

  update public.rooms
  set name = btrim(p_name), base_currency = p_base_currency, start_date = p_start_date, end_date = p_end_date
  where id = p_room_id;
end;
$$;

create function public.rotate_invite(p_room_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_token text := public.new_invite_token();
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select owner_id into v_owner from public.rooms where id = p_room_id and deleted_at is null for update;
  if not found or v_owner <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  update public.rooms set invite_token = v_token where id = p_room_id;
  return v_token;
end;
$$;

revoke execute on function public.new_invite_token() from public, anon, authenticated;
revoke execute on function public.create_room(text, text, date, date), public.preview_invite(text), public.join_room(text),
  public.update_room(uuid, text, text, date, date), public.rotate_invite(uuid) from public, anon;
grant execute on function public.create_room(text, text, date, date), public.preview_invite(text), public.join_room(text),
  public.update_room(uuid, text, text, date, date), public.rotate_invite(uuid) to authenticated;
