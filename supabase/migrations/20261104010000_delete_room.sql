-- 여행 방 삭제(여행 방 설정 화면). 방장만 할 수 있고, leave_room의 마지막 멤버 경로와 같은 soft delete다.
-- 다른 참여자의 장부까지 같이 사라지므로 정산이 남아 있으면 막는다 — 기준은 leave_room과 같다:
-- 확정 송금 기준 net ≠ 0 인 참여자가 있거나, 공동 지출에 환율 미확정이 남아 있으면 거절한다.
-- Storage 사진 정리는 ARCHITECTURE §4대로 별도 정리 작업(P1)이 맡는다.
create function public.delete_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where id = p_room_id and deleted_at is null for update;
  if not found or v_room.owner_id <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if exists (select 1 from public.expenses where room_id = p_room_id and deleted_at is null
             and fx_source = 'pending' and visibility = 'shared') then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_SETTLED';
  end if;
  if exists (select 1 from public.room_balances(p_room_id, true) b where b.net <> 0) then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_SETTLED';
  end if;

  update public.rooms set deleted_at = now() where id = p_room_id;
end;
$$;

revoke execute on function public.delete_room(uuid) from public, anon;
grant execute on function public.delete_room(uuid) to authenticated;
