begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ───── fixture ─────
-- A·B는 자유여행 방 R(예약 없음)의 멤버, C는 남. P는 A의 패키지 방(예약 연동).
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.p() returns uuid language sql as $$ select current_setting('t.p')::uuid $$;
-- 그날 일정 제목을 위→아래 순서로 이어 붙인다.
create function pg_temp.day(p_room uuid, p_day int) returns text language sql as $$
  select string_agg(title, ',' order by position) from public.schedule_items where room_id = p_room and day_index = p_day;
$$;
create function pg_temp.sid(p_room uuid, p_title text) returns uuid language sql as $$
  select id from public.schedule_items where room_id = p_room and title = p_title;
$$;
create function pg_temp.add(p_room uuid, p_day int, p_title text, p_time text default null, p_pos int default null)
returns uuid language sql as $$
  select public.save_schedule_item(jsonb_build_object('room_id', p_room, 'day_index', p_day, 'title', p_title,
    'start_time', p_time, 'position', p_pos));
$$;

select pg_temp.as_user('a');
select set_config('t.r', public.create_room('도쿄 자유여행', 'JPY')::text, true);
select set_config('t.p', public.create_room('오사카 패키지', 'JPY')::text, true);
select pg_temp.as_user('b');
select public.join_room((select invite_token from public.rooms where id = pg_temp.r()));

-- ───── 자유여행: 시간 없는 일정 ─────
select lives_ok($$select pg_temp.add(pg_temp.r(), 1, '시부야')$$, '예약 없는 방에서도 시간 없이 일정을 만든다');
select is((select start_time from public.schedule_items where id = pg_temp.sid(pg_temp.r(), '시부야')), null,
  '시간은 비워 둘 수 있다');
select pg_temp.add(pg_temp.r(), 1, '하라주쿠');
select pg_temp.add(pg_temp.r(), 1, '신주쿠');
select is(pg_temp.day(pg_temp.r(), 1), '시부야,하라주쿠,신주쿠', '[+ 일정 추가]는 그날 맨 아래에 붙는다');

select pg_temp.as_user('a');
select pg_temp.add(pg_temp.r(), 1, '아사쿠사', null,
  (select position from public.schedule_items where id = pg_temp.sid(pg_temp.r(), '하라주쿠')));
select is(pg_temp.day(pg_temp.r(), 1), '시부야,아사쿠사,하라주쿠,신주쿠', '위에 일정 추가는 그 일정 바로 위에 들어간다');
select pg_temp.add(pg_temp.r(), 1, '긴자', null,
  (select position + 1 from public.schedule_items where id = pg_temp.sid(pg_temp.r(), '신주쿠')));
select is(pg_temp.day(pg_temp.r(), 1), '시부야,아사쿠사,하라주쿠,신주쿠,긴자', '아래에 일정 추가는 그 일정 바로 아래에 들어간다');

-- ───── 날짜 변경: 새 날짜 맨 아래, 연결된 지출은 그대로 따라간다 ─────
select pg_temp.add(pg_temp.r(), 2, '디즈니');
select public.save_schedule_item(jsonb_build_object('id', pg_temp.sid(pg_temp.r(), '시부야'), 'room_id', pg_temp.r(),
  'day_index', 2, 'title', '시부야'));
select is(pg_temp.day(pg_temp.r(), 2), '디즈니,시부야', '날짜를 바꾸면 그 날짜 맨 아래로 간다');
select is(pg_temp.day(pg_temp.r(), 1), '아사쿠사,하라주쿠,신주쿠,긴자', '원래 날짜에서는 빠진다');

-- ───── 패키지: 시간 있는 일정은 시간 순서 자리 ─────
select public.link_booking(pg_temp.p(), jsonb_build_object(
  'provider', 'hanatour', 'booking_no', 'HT-ORDER-1', 'holder_masked', '이*지', 'product_name', '오사카 3일',
  'start_date', '2025-10-20', 'end_date', '2025-10-22', 'pax', 2, 'paid_amount', 1000000,
  'schedule', jsonb_build_array(
    jsonb_build_object('day_index', 1, 'start_time', '13:00', 'title', '오사카성'),
    jsonb_build_object('day_index', 1, 'start_time', '09:30', 'title', '인천 → 간사이'),
    jsonb_build_object('day_index', 1, 'start_time', '18:00', 'title', '도톤보리'))));
select is(pg_temp.day(pg_temp.p(), 1), '인천 → 간사이,오사카성,도톤보리', '예약 일정은 시간순으로 들어온다');

select pg_temp.add(pg_temp.p(), 1, '자유 시간', null,
  (select position from public.schedule_items where id = pg_temp.sid(pg_temp.p(), '오사카성')));
select pg_temp.add(pg_temp.p(), 1, '우메다 공중정원', '15:00');
select is(pg_temp.day(pg_temp.p(), 1), '인천 → 간사이,자유 시간,오사카성,우메다 공중정원,도톤보리',
  '시간 있는 새 일정은 시간 순서 자리, 시간 없는 일정은 추가한 자리에 남는다');

select public.save_schedule_item(jsonb_build_object('id', pg_temp.sid(pg_temp.p(), '오사카성'), 'room_id', pg_temp.p(),
  'day_index', 1, 'start_time', '20:00', 'title', '오사카성'));
select is(pg_temp.day(pg_temp.p(), 1), '인천 → 간사이,자유 시간,우메다 공중정원,도톤보리,오사카성',
  '시간을 고치면 시간 순서 자리로 옮겨 간다');

-- ───── 다시 불러오기: 남은 사용자 일정 사이에도 시간순으로 ─────
select public.refetch_booking(pg_temp.p(), jsonb_build_object('schedule', jsonb_build_array(
  jsonb_build_object('day_index', 1, 'start_time', '11:00', 'title', '구로몬 시장'))));
select is(pg_temp.day(pg_temp.p(), 1), '자유 시간,구로몬 시장,우메다 공중정원,오사카성',
  '다시 불러온 일정도 시간 순서 자리로 들어간다');

-- ───── 검증·권한 ─────
select throws_ok($$select pg_temp.add(pg_temp.r(), 1, '잘못된 시간', '25:00')$$,
  'P0001', 'INVALID_INPUT', '24시 이상 시간은 거부한다');
select pg_temp.as_user('c');
select throws_ok($$select pg_temp.add(pg_temp.r(), 1, '남의 방')$$,
  'P0001', 'FORBIDDEN', '남의 방에는 일정을 만들 수 없다');
select ok(not has_function_privilege('anon', 'public.save_schedule_item(jsonb)', 'execute'),
  'anon은 save_schedule_item을 실행할 수 없다');
select ok(not has_function_privilege('authenticated', 'public._place_schedule(uuid, int)', 'execute'),
  '_place_schedule은 직접 부를 수 없다');

-- ───── 지출 삭제 권한(노션 12번) ─────
-- 방 R: A가 올리고 결제자는 p_payer. 공금 결제면 p_payer는 무시된다.
create function pg_temp.exp(p_payer text, p_pool boolean default false) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user('a');
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', pg_temp.r(),
    'payer_kind', case when p_pool then 'pool' else 'member' end,
    'payer_member_id', case when p_pool then null else
      (select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid(p_payer)) end,
    'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
    'scope_member_ids', (select jsonb_agg(id) from public.room_members where room_id = pg_temp.r()),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0,
      'name_original', '품목', 'amount_original', 10000))));
  return v_id;
end $$;

select set_config('t.ea', pg_temp.exp('a')::text, true);
select pg_temp.as_user('b');
select throws_ok(format('select public.delete_expense(%L, 1)', current_setting('t.ea')),
  'P0001', 'FORBIDDEN', '올린 사람도 결제자도 아니면 지출을 지울 수 없다');

select set_config('t.eb', pg_temp.exp('b')::text, true);
select pg_temp.as_user('b');
select lives_ok(format('select public.delete_expense(%L, 1)', current_setting('t.eb')),
  '결제자 본인은 남이 올린 지출도 지운다');

update public.rooms set pool_enabled = true where id = pg_temp.r();
select set_config('t.ep', pg_temp.exp(null, true)::text, true);
select pg_temp.as_user('b');
select throws_ok(format('select public.delete_expense(%L, 1)', current_setting('t.ep')),
  'P0001', 'FORBIDDEN', '공금 결제는 올린 사람만 지운다');

-- 보낸 이 자리 정산에 들어간 지출(픽스처는 superuser로 직접 넣는다)
insert into public.spot_settles (room_id, schedule_id, payer_member_id, token, sent_at, created_by)
values (pg_temp.r(), pg_temp.sid(pg_temp.r(), '아사쿠사'),
        (select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid('a')),
        'tok-210-spot-sent-00000', now(), pg_temp.uid('a'));
insert into public.spot_expenses (spot_id, expense_id, room_id)
values ((select id from public.spot_settles where token = 'tok-210-spot-sent-00000'), current_setting('t.ea')::uuid, pg_temp.r());
select pg_temp.as_user('a');
select throws_ok(format('select public.delete_expense(%L, 1)', current_setting('t.ea')),
  'P0001', 'SPOT_SENT', '보낸 이 자리 정산에 들어간 지출은 지울 수 없다');

select * from finish();
rollback;
