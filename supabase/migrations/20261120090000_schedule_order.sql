-- 일정 순서·자유여행 일정 (노션 UI 업데이트 9·16·19번)
-- 날짜 안 정렬 기준은 position 하나다(위→아래 = 하루 순서). 시간은 선택(null 허용).
-- 시간 있는 일정은 저장할 때 시간 순서 자리에 놓는다 → position만 보면 항상 시간순이 지켜진다.
-- 시간 없는 일정은 추가한 위치(맨 아래 또는 위·아래에 추가)를 지킨다.
-- 일정 쓰기 RPC는 처음부터 예약 연동 여부를 보지 않으므로 자유여행 방에서도 그대로 쓴다.

alter table public.schedule_items add column position int not null default 0;
alter table public.schedule_items alter column start_time drop not null;

-- 기존 일정은 지금 보이던 순서(시간 → 입력 순) 그대로 번호를 매긴다.
update public.schedule_items s
set position = o.rn
from (
  select id, (row_number() over (partition by room_id, day_index order by start_time, created_at) - 1)::int as rn
  from public.schedule_items
) o
where o.id = s.id;

drop index public.schedule_items_room_day_idx;
create index schedule_items_room_day_idx on public.schedule_items (room_id, day_index, position);

-- 일정 하나를 그 날짜 안 제자리에 놓는다.
-- 시간 있음: 그보다 늦은 시간의 첫 일정 바로 위(없으면 맨 아래). 시간 없음: p_pos 자리(null이면 맨 아래).
create function public._place_schedule(p_id uuid, p_pos int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.schedule_items;
  v_target int := p_pos;
begin
  select * into v from public.schedule_items where id = p_id;
  if v.start_time is not null then
    select s.position into v_target from public.schedule_items s
    where s.room_id = v.room_id and s.day_index = v.day_index and s.id <> p_id and s.start_time > v.start_time
    order by s.position limit 1;
  end if;
  if v_target is null then
    update public.schedule_items set position = coalesce((
      select max(s.position) from public.schedule_items s
      where s.room_id = v.room_id and s.day_index = v.day_index and s.id <> p_id), -1) + 1
    where id = p_id;
  else
    update public.schedule_items set position = position + 1
    where room_id = v.room_id and day_index = v.day_index and id <> p_id and position >= v_target;
    update public.schedule_items set position = v_target where id = p_id;
  end if;
end;
$$;

-- 일정 payload(jsonb 배열) → schedule_items. source는 호출자가 정하지 않는다.
-- 다시 불러오기로 남은 사용자 일정 사이에도 시간 순서 자리로 들어가도록 한 건씩 놓는다.
create or replace function public._insert_schedule(p_room_id uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x jsonb;
  v_id uuid;
begin
  for x in select e from jsonb_array_elements(coalesce(nullif(p_items, 'null'), '[]')) as e loop
    insert into public.schedule_items (room_id, day_index, start_time, title, includes, excludes, optional, est_amount, source)
    values (p_room_id,
            (x ->> 'day_index')::int,
            nullif(x ->> 'start_time', ''),
            x ->> 'title',
            coalesce(array(select jsonb_array_elements_text(x -> 'includes')), '{}'),
            coalesce(array(select jsonb_array_elements_text(x -> 'excludes')), '{}'),
            coalesce((x ->> 'optional')::boolean, false),
            coalesce((x ->> 'est_amount')::bigint, 0),
            'api')
    returning id into v_id;
    perform public._place_schedule(v_id, null);
  end loop;
end;
$$;

-- 일정 추가·수정. 방 참여자 모두 할 수 있고, 결과는 모두에게 같게 보인다(명세 확인필요 5).
-- position: 새 일정을 넣을 자리([위에/아래에 일정 추가]). 없으면 그날 맨 아래.
-- 수정에서 날짜를 바꾸면 새 날짜 맨 아래(시간 있으면 시간 순서 자리)로 간다. 연결된 지출은 schedule_id로 따라온다.
create or replace function public.save_schedule_item(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_payload ->> 'id')::uuid;
  v_room uuid := (p_payload ->> 'room_id')::uuid;
  v_day int := (p_payload ->> 'day_index')::int;
  v_time text := nullif(btrim(coalesce(p_payload ->> 'start_time', '')), '');
  v_title text := btrim(coalesce(p_payload ->> 'title', ''));
  v_inc text[] := coalesce(array(select jsonb_array_elements_text(p_payload -> 'includes')), '{}');
  v_optional boolean := coalesce((p_payload ->> 'optional')::boolean, false);
  v_est bigint := coalesce((p_payload ->> 'est_amount')::bigint, 0);
  v_pos int := (p_payload ->> 'position')::int;
  v_old public.schedule_items;
begin
  if auth.uid() is null or not public.is_room_member(v_room) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if (v_time is not null and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') or char_length(v_title) not between 1 and 60
     or v_est < 0 or v_day is null or v_day < 0 or v_pos < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  if v_id is null then
    insert into public.schedule_items (room_id, day_index, start_time, title, includes, optional, est_amount,
                                       source, edited_by, edited_at)
    values (v_room, v_day, v_time, v_title, v_inc, v_optional, v_est,
            'user', auth.uid(), now())
    returning id into v_id;
    perform public._place_schedule(v_id, v_pos);
    return v_id;
  end if;

  select * into v_old from public.schedule_items where id = v_id for update;
  if not found or v_old.room_id <> v_room then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  -- 처음 수정할 때 불포함 칩은 지운다. 포함 사항은 고른 값으로 통째로 바꾼다(명세 §6).
  update public.schedule_items
  set day_index = v_day, start_time = v_time, title = v_title, includes = v_inc, excludes = '{}',
      optional = v_optional, est_amount = v_est, edited_by = auth.uid(), edited_at = now()
  where id = v_id;
  if v_day <> v_old.day_index or v_time is distinct from v_old.start_time then
    perform public._place_schedule(v_id, null);
  end if;
  return v_id;
end;
$$;

revoke execute on function public._place_schedule(uuid, int), public._insert_schedule(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.save_schedule_item(jsonb) from public, anon;
grant execute on function public.save_schedule_item(jsonb) to authenticated;

-- ───────── 지출 삭제 권한 (노션 UI 업데이트 12번, 지출 상세 [삭제]) ─────────
-- 최신 정의(20261101141059_expense_visibility.sql)를 그대로 옮기고 두 검사를 더한다.
-- (1) 올린 사람이나 결제자 본인만 지운다. 공금 결제는 결제자가 사람이 아니라 올린 사람만.
-- (2) 보낸 이 자리 정산에 들어간 지출은 지울 수 없다 — 이미 요청한 금액이 바뀐다.
create or replace function public.delete_expense(p_id uuid, p_expected_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
  v_e public.expenses;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select room_id into v_room_id from public.expenses where id = p_id;
  perform 1 from public.rooms where id = v_room_id and deleted_at is null for update;
  if not found or public.my_member_id(v_room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select * into v_e from public.expenses where id = p_id;  -- 잠금 후 다시 읽는다
  if v_e.visibility = 'private' and v_e.created_by <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if v_e.deleted_at is not null then return; end if;     -- 재전송 멱등
  if v_e.created_by is distinct from auth.uid()
     and not (v_e.payer_kind = 'member' and v_e.payer_member_id = public.my_member_id(v_room_id)) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if exists (select 1 from public.spot_expenses x join public.spot_settles s on s.id = x.spot_id
             where x.expense_id = p_id and s.sent_at is not null) then
    raise exception using errcode = 'P0001', message = 'SPOT_SENT';
  end if;
  if v_e.version is distinct from p_expected_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  update public.expenses set deleted_at = now(), deleted_by = auth.uid(), version = version + 1 where id = p_id;
  perform public._record_history(p_id, 'delete');
end;
$$;

revoke execute on function public.delete_expense(uuid, int) from public, anon;
grant execute on function public.delete_expense(uuid, int) to authenticated;
