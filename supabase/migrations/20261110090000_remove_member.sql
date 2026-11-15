-- 멤버 내보내기(여행 방 설정, PRD F2.5). 방장만, 자기 자신은 안 된다.
-- 정산이 남아 있어도 내보낼 수 있다 — 장부 기록과 잔액은 그대로 남고(room_balances는 나간 멤버도 센다),
-- 경고는 클라이언트 확인 시트가 띄운다. 게스트 대표·공금 통장 주인은 남은 사람이 없어지므로 먼저 넘기게 한다.
-- 사용자를 내보내면 초대 링크를 재발급한다(유출된 링크로 다시 들어오지 못하게).
create function public.remove_member(p_room_id uuid, p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
  v_target public.room_members;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where id = p_room_id and deleted_at is null for update;
  if not found or v_room.owner_id <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  select * into v_target from public.room_members where id = p_member_id and room_id = p_room_id and left_at is null;
  if not found or v_target.user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_room.pool_owner_member_id = p_member_id
     or exists (select 1 from public.room_members where room_id = p_room_id and kind = 'guest'
                and left_at is null and representative_member_id = p_member_id) then
    raise exception using errcode = 'P0001', message = 'MEMBER_HAS_ROLE';
  end if;

  update public.room_members set left_at = now(), removed_by = auth.uid() where id = p_member_id;
  insert into public.room_events (room_id, kind, actor_id, target_member_id)
  values (p_room_id, 'removed', auth.uid(), p_member_id);

  if v_target.kind = 'user' then
    update public.rooms set invite_token = public.new_invite_token() where id = p_room_id;
  end if;
end;
$$;

revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
