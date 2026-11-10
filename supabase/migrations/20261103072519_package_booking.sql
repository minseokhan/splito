-- 패키지 예약 연동 (하나투어)
-- 예약을 연동한 방에만 일정이 붙는다. 일정은 표시용 메타데이터이고, 정산·순잔액 계산에는 전혀 들어가지 않는다.
-- 지출과의 연결은 expenses.schedule_id 하나뿐이고 room_balances는 이 컬럼을 보지 않는다.

create table public.trip_bookings (
  room_id uuid primary key references public.rooms (id),
  provider text not null check (provider in ('hanatour')),
  booking_no text not null,
  holder_masked text not null,          -- 예약자 이름은 조회에만 쓰고 마스킹해서 보관한다(이*지)
  product_name text not null,
  destination text,
  start_date date,
  end_date date,
  pax int not null check (pax >= 1),
  paid_amount bigint not null check (paid_amount >= 0),
  paid_at date,
  linked_by uuid not null references public.profiles (id),
  linked_at timestamptz not null default now(),
  last_fetched_at timestamptz not null default now(),
  unique (provider, booking_no)         -- 한 예약 = 한 방
);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  day_index int not null check (day_index >= 0),   -- 0 = 여행 전, 1 = 1일차
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  includes text[] not null default '{}',
  excludes text[] not null default '{}',
  optional boolean not null default false,
  est_amount bigint not null default 0 check (est_amount >= 0),
  source text not null check (source in ('api', 'user')),
  edited_by uuid references public.profiles (id),
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  -- expenses가 (schedule_id, room_id)로 걸 수 있게 한다. 다른 방 일정에 지출을 붙이는 걸 DB가 막는다.
  unique (id, room_id)
);
create index schedule_items_room_day_idx on public.schedule_items (room_id, day_index, start_time);

-- 선택관광 [안 해요]. 사용자별이라 방 전체에 영향을 주지 않는다.
create table public.schedule_hides (
  schedule_id uuid not null references public.schedule_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  room_id uuid not null references public.rooms (id),
  created_at timestamptz not null default now(),
  primary key (schedule_id, user_id)
);

-- 지출 ↔ 일정 연결과 태그. 둘 다 표시용이라 save_expense는 건드리지 않는다.
alter table public.expenses
  add column schedule_id uuid,
  add column flags text[] not null default '{}';
alter table public.expenses
  add constraint expenses_schedule_id_room_id_fkey
  foreign key (schedule_id, room_id) references public.schedule_items (id, room_id) on delete set null;
create index expenses_schedule_idx on public.expenses (schedule_id) where schedule_id is not null;

-- ───────────────────────── RLS ─────────────────────────
alter table public.trip_bookings enable row level security;
alter table public.schedule_items enable row level security;
alter table public.schedule_hides enable row level security;

grant select on public.trip_bookings, public.schedule_items, public.schedule_hides to authenticated;

create policy trip_bookings_select on public.trip_bookings for select to authenticated
  using (public.is_room_member(room_id));
create policy schedule_items_select on public.schedule_items for select to authenticated
  using (public.is_room_member(room_id));
-- 숨김은 내 것만 보인다. 남이 뭘 숨겼는지는 알 필요가 없다.
create policy schedule_hides_select on public.schedule_hides for select to authenticated
  using ((select auth.uid()) = user_id and public.is_room_member(room_id));

-- ───────────────────────── RPC ─────────────────────────

-- 예약 조회 결과 '이미 연결됨' 판정. 그 방의 참여자가 아니면 방 이름을 숨긴다(명세 §2-2).
create function public.booking_owner(p_provider text, p_booking_no text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.trip_bookings;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v from public.trip_bookings where provider = p_provider and booking_no = p_booking_no;
  if not found then return null; end if;
  if public.is_room_member(v.room_id) then
    return jsonb_build_object('room_id', v.room_id,
      'room_name', (select name from public.rooms where id = v.room_id), 'is_member', true);
  end if;
  return jsonb_build_object('room_id', null, 'room_name', null, 'is_member', false);
end;
$$;

-- 일정 payload(jsonb 배열) → schedule_items. source는 호출자가 정하지 않는다.
create function public._insert_schedule(p_room_id uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.schedule_items (room_id, day_index, start_time, title, includes, excludes, optional, est_amount, source)
  select p_room_id,
         (x ->> 'day_index')::int,
         x ->> 'start_time',
         x ->> 'title',
         coalesce(array(select jsonb_array_elements_text(x -> 'includes')), '{}'),
         coalesce(array(select jsonb_array_elements_text(x -> 'excludes')), '{}'),
         coalesce((x ->> 'optional')::boolean, false),
         coalesce((x ->> 'est_amount')::bigint, 0),
         'api'
  from jsonb_array_elements(coalesce(nullif(p_items, 'null'), '[]')) as x;
end;
$$;

-- 예약을 이 방에 붙인다. 방을 새로 만들지 않는다 — 방은 이미 있어야 한다.
create function public.link_booking(p_room_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_provider text := p_payload ->> 'provider';
  v_no text := p_payload ->> 'booking_no';
  v_pax int := (p_payload ->> 'pax')::int;
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if coalesce(v_provider, '') <> 'hanatour' or coalesce(btrim(v_no), '') = ''
     or coalesce(v_pax, 0) < 1 or (p_payload ->> 'paid_amount')::bigint is null then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if exists (select 1 from public.trip_bookings where room_id = p_room_id) then
    raise exception using errcode = 'P0001', message = 'ALREADY_LINKED';
  end if;
  if exists (select 1 from public.trip_bookings where provider = v_provider and booking_no = v_no) then
    raise exception using errcode = 'P0001', message = 'BOOKING_TAKEN';
  end if;

  insert into public.trip_bookings (room_id, provider, booking_no, holder_masked, product_name, destination,
                                    start_date, end_date, pax, paid_amount, paid_at, linked_by)
  values (p_room_id, v_provider, v_no, p_payload ->> 'holder_masked', p_payload ->> 'product_name',
          p_payload ->> 'destination', (p_payload ->> 'start_date')::date, (p_payload ->> 'end_date')::date,
          v_pax, (p_payload ->> 'paid_amount')::bigint, (p_payload ->> 'paid_at')::date, auth.uid());

  perform public._insert_schedule(p_room_id, p_payload -> 'schedule');
end;
$$;

-- 연동 해제: 예약 행만 지운다. 일정과 지출의 schedule_id는 재연동에 대비해 그대로 둔다(명세 확인필요 7).
create function public.unlink_booking(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  delete from public.trip_bookings where room_id = p_room_id;
end;
$$;

-- 다시 불러오기: 사용자가 손대지 않은 API 일정만 갈아 끼운다(명세 확인필요 6).
-- 수정·추가한 일정(source='user' 또는 edited_at 있음)과 지출이 연결된 일정은 그대로 둔다.
create function public.refetch_booking(p_room_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if not exists (select 1 from public.trip_bookings where room_id = p_room_id) then
    raise exception using errcode = 'P0001', message = 'NOT_LINKED';
  end if;

  delete from public.schedule_items s
  where s.room_id = p_room_id and s.source = 'api' and s.edited_at is null
    and not exists (select 1 from public.expenses e where e.schedule_id = s.id);

  perform public._insert_schedule(p_room_id, p_payload -> 'schedule');
  update public.trip_bookings set last_fetched_at = now(),
         product_name = coalesce(p_payload ->> 'product_name', product_name),
         pax = coalesce((p_payload ->> 'pax')::int, pax)
  where room_id = p_room_id;
end;
$$;

-- 일정 추가·수정. 방 참여자 모두 할 수 있고, 결과는 모두에게 같게 보인다(명세 확인필요 5).
create function public.save_schedule_item(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_payload ->> 'id')::uuid;
  v_room uuid := (p_payload ->> 'room_id')::uuid;
  v_time text := p_payload ->> 'start_time';
  v_title text := btrim(coalesce(p_payload ->> 'title', ''));
  v_inc text[] := coalesce(array(select jsonb_array_elements_text(p_payload -> 'includes')), '{}');
  v_optional boolean := coalesce((p_payload ->> 'optional')::boolean, false);
  v_est bigint := coalesce((p_payload ->> 'est_amount')::bigint, 0);
  v_old public.schedule_items;
begin
  if auth.uid() is null or not public.is_room_member(v_room) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or char_length(v_title) not between 1 and 60
     or v_est < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  if v_id is null then
    insert into public.schedule_items (room_id, day_index, start_time, title, includes, optional, est_amount,
                                       source, edited_by, edited_at)
    values (v_room, (p_payload ->> 'day_index')::int, v_time, v_title, v_inc, v_optional, v_est,
            'user', auth.uid(), now())
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from public.schedule_items where id = v_id for update;
  if not found or v_old.room_id <> v_room then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  -- 처음 수정할 때 불포함 칩은 지운다. 포함 사항은 고른 값으로 통째로 바꾼다(명세 §6).
  update public.schedule_items
  set start_time = v_time, title = v_title, includes = v_inc, excludes = '{}',
      optional = v_optional, est_amount = v_est, edited_by = auth.uid(), edited_at = now()
  where id = v_id;
  return v_id;
end;
$$;

-- 삭제: 연결된 지출은 지우지 않고 풀어준다 → 그 날의 '그 외 지출'로 간다(명세 §6).
create function public.delete_schedule_item(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.schedule_items;
begin
  select * into v from public.schedule_items where id = p_id;
  if not found then return; end if;
  if auth.uid() is null or not public.is_room_member(v.room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  update public.expenses set schedule_id = null where schedule_id = p_id;
  delete from public.schedule_items where id = p_id;
end;
$$;

-- 선택관광 숨김/되돌리기. 사용자별이라 다른 참여자에게는 영향이 없다.
create function public.set_schedule_hidden(p_schedule_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.schedule_items;
begin
  select * into v from public.schedule_items where id = p_schedule_id;
  if not found or auth.uid() is null or not public.is_room_member(v.room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_hidden then
    insert into public.schedule_hides (schedule_id, user_id, room_id)
    values (p_schedule_id, auth.uid(), v.room_id) on conflict do nothing;
  else
    delete from public.schedule_hides where schedule_id = p_schedule_id and user_id = auth.uid();
  end if;
end;
$$;

-- 지출의 표시용 메타(일정 연결·태그)만 바꾼다. 금액·배분·환율은 건드리지 않으므로 save_expense와 무관하다.
create function public.set_expense_meta(p_expense_id uuid, p_schedule_id uuid default null, p_flags text[] default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.expenses;
begin
  select * into v from public.expenses where id = p_expense_id and deleted_at is null;
  if not found or auth.uid() is null or not public.is_room_member(v.room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if v.visibility = 'private' and v.created_by <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  -- 다른 방 일정에 붙이려는 시도는 FK가 막지만, 에러 문구를 우리 것으로 돌려준다.
  if p_schedule_id is not null and not exists (
    select 1 from public.schedule_items where id = p_schedule_id and room_id = v.room_id
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  update public.expenses
  set schedule_id = p_schedule_id, flags = coalesce(p_flags, flags)
  where id = p_expense_id;
end;
$$;

revoke execute on function public._insert_schedule(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.booking_owner(text, text), public.link_booking(uuid, jsonb),
  public.unlink_booking(uuid), public.refetch_booking(uuid, jsonb), public.save_schedule_item(jsonb),
  public.delete_schedule_item(uuid), public.set_schedule_hidden(uuid, boolean),
  public.set_expense_meta(uuid, uuid, text[]) from public, anon;
grant execute on function public.booking_owner(text, text), public.link_booking(uuid, jsonb),
  public.unlink_booking(uuid), public.refetch_booking(uuid, jsonb), public.save_schedule_item(jsonb),
  public.delete_schedule_item(uuid), public.set_schedule_hidden(uuid, boolean),
  public.set_expense_meta(uuid, uuid, text[]) to authenticated;
