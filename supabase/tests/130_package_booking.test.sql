begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- ───── fixture ─────
-- A·B는 방 R의 멤버, C는 남. 예약 하나를 R에 붙이고 일정·지출 연결을 본다.
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.r2() returns uuid language sql as $$ select current_setting('t.r2')::uuid $$;
create function pg_temp.m(p_room uuid, l text) returns uuid language sql as $$
  select id from public.room_members where room_id = p_room and user_id = pg_temp.uid(l);
$$;
create function pg_temp.sched(p_no text) returns jsonb language sql as $$
  select jsonb_build_object(
    'provider', 'hanatour', 'booking_no', p_no, 'holder_masked', '이*지',
    'product_name', '[하나투어] 오사카·교토 4일', 'destination', '일본 · 오사카, 교토',
    'start_date', '2025-10-20', 'end_date', '2025-10-23', 'pax', 4,
    'paid_amount', 2980000, 'paid_at', '2025-10-02',
    'schedule', jsonb_build_array(
      jsonb_build_object('day_index', 1, 'start_time', '13:00', 'title', '오사카성 공원',
                         'includes', jsonb_build_array('가이드', '입장료 포함')),
      jsonb_build_object('day_index', 1, 'start_time', '09:30', 'title', '인천 → 간사이',
                         'includes', jsonb_build_array('항공 포함')),
      jsonb_build_object('day_index', 2, 'start_time', '11:00', 'title', '익스프레스 패스 4',
                         'optional', true, 'est_amount', 180000)));
$$;
create function pg_temp.sid(p_title text) returns uuid language sql as $$
  select id from public.schedule_items where room_id = pg_temp.r() and title = p_title;
$$;
-- 1박스 KRW 지출
create function pg_temp.exp(l text, p_room uuid) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', p_room, 'payer_kind', 'member', 'payer_member_id', pg_temp.m(p_room, l),
    'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
    'scope_member_ids', jsonb_build_array(pg_temp.m(p_room, l)),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0,
      'name_original', '품목', 'amount_original', 81000))));
  return v_id;
end $$;

-- 픽스처는 superuser로 돌린다(RLS 우회). RLS 자체는 아래에서 role을 바꿔 따로 본다.
select pg_temp.as_user('a');
select set_config('t.r', public.create_room('오사카·교토 4일', 'JPY')::text, true);
select pg_temp.as_user('b');
select public.join_room((select invite_token from public.rooms where id = pg_temp.r()));
select pg_temp.as_user('c');
select set_config('t.r2', public.create_room('남의 방', 'KRW')::text, true);

-- ───── 연동 ─────
select pg_temp.as_user('a');
select lives_ok($$select public.link_booking(pg_temp.r(), pg_temp.sched('HT2410-58213'))$$, '예약을 방에 붙인다');
select is((select pax from public.trip_bookings where room_id = pg_temp.r()), 4, '예약 인원이 저장된다');
select is((select count(*)::int from public.schedule_items where room_id = pg_temp.r()), 3, '일정 3건이 들어간다');
select is((select source from public.schedule_items where id = pg_temp.sid('오사카성 공원')), 'api',
  'API 일정의 source는 api');

select throws_ok($$select public.link_booking(pg_temp.r(), pg_temp.sched('HT0000-00001'))$$,
  'P0001', 'ALREADY_LINKED', '한 방에 예약을 두 번 붙일 수 없다');
select pg_temp.as_user('c');
select throws_ok($$select public.link_booking(pg_temp.r2(), pg_temp.sched('HT2410-58213'))$$,
  'P0001', 'BOOKING_TAKEN', '같은 예약번호를 다른 방에 붙일 수 없다');
select throws_ok($$select public.link_booking(pg_temp.r(), pg_temp.sched('HT0000-00002'))$$,
  'P0001', 'FORBIDDEN', '남의 방에는 붙일 수 없다');

-- ───── 이미 연결됨 판정 ─────
select is(public.booking_owner('hanatour', 'HT2410-58213') ->> 'is_member', 'false',
  '참여자가 아니면 is_member=false');
select is(public.booking_owner('hanatour', 'HT2410-58213') ->> 'room_name', null,
  '참여자가 아니면 방 이름을 숨긴다');
select pg_temp.as_user('a');
select is(public.booking_owner('hanatour', 'HT2410-58213') ->> 'room_name', '오사카·교토 4일',
  '참여자면 방 이름이 보인다');
select ok(public.booking_owner('hanatour', 'HT9999-99999') is null, '연결 안 된 예약번호는 null');

-- ───── RLS (실제 authenticated 롤로) ─────
select pg_temp.as_user('c');
set local role authenticated;
select is((select count(*)::int from public.schedule_items where room_id = pg_temp.r()), 0,
  '남의 방 일정은 RLS가 가린다');
select is((select count(*)::int from public.trip_bookings where room_id = pg_temp.r()), 0,
  '남의 방 예약은 RLS가 가린다');
reset role;

-- ───── 일정 수정·추가 (참여자 전원) ─────
select pg_temp.as_user('b');
select lives_ok($$select public.save_schedule_item(jsonb_build_object(
  'id', pg_temp.sid('오사카성 공원'), 'room_id', pg_temp.r(), 'day_index', 1,
  'start_time', '14:00', 'title', '오사카성 천수각', 'includes', jsonb_build_array('입장료 포함')))$$,
  '방장이 아닌 참여자도 일정을 수정한다');
select is((select edited_at is not null from public.schedule_items where id = pg_temp.sid('오사카성 천수각')),
  true, '수정하면 edited_at이 찍힌다(직접 수정 배지)');
select is((select excludes from public.schedule_items where id = pg_temp.sid('오사카성 천수각')), '{}'::text[],
  '수정하면 불포함 칩은 지워진다');
select throws_ok($$select public.save_schedule_item(jsonb_build_object(
  'room_id', pg_temp.r(), 'day_index', 1, 'start_time', '25:00', 'title', '잘못된 시간'))$$,
  'P0001', 'INVALID_INPUT', '24시 이상 시간은 거부한다');

-- ───── 지출 연결 ─────
select set_config('t.e', pg_temp.exp('b', pg_temp.r())::text, true);
select pg_temp.as_user('b');
select lives_ok($$select public.set_expense_meta(current_setting('t.e')::uuid, pg_temp.sid('오사카성 천수각'), null)$$,
  '지출을 일정에 연결한다');
select set_config('t.e2', pg_temp.exp('c', pg_temp.r2())::text, true);
select pg_temp.as_user('c');
select throws_ok($$select public.set_expense_meta(current_setting('t.e2')::uuid, pg_temp.sid('오사카성 천수각'), null)$$,
  'P0001', 'INVALID_INPUT', '다른 방 일정에는 연결할 수 없다');

-- ───── 삭제: 지출은 남고 연결만 풀린다 ─────
select pg_temp.as_user('a');
select public.delete_schedule_item(pg_temp.sid('오사카성 천수각'));
select is((select schedule_id from public.expenses where id = current_setting('t.e')::uuid), null,
  '일정을 지우면 지출의 연결만 풀린다');
select is((select count(*)::int from public.expenses where id = current_setting('t.e')::uuid and deleted_at is null),
  1, '일정을 지워도 지출은 그대로 남는다');

-- ───── 다시 불러오기: 사용자 수정분은 덮어쓰지 않는다 ─────
select public.save_schedule_item(jsonb_build_object(
  'room_id', pg_temp.r(), 'day_index', 3, 'start_time', '10:00', 'title', '내가 넣은 일정'));
select public.refetch_booking(pg_temp.r(), pg_temp.sched('HT2410-58213'));
select is((select count(*)::int from public.schedule_items where room_id = pg_temp.r() and title = '내가 넣은 일정'),
  1, '다시 불러와도 사용자가 추가한 일정은 남는다');

-- ───── 연동 해제: 지출은 그대로 ─────
select public.unlink_booking(pg_temp.r());
select is((select count(*)::int from public.trip_bookings where room_id = pg_temp.r()), 0, '예약 연결이 끊긴다');

select * from finish();
rollback;
