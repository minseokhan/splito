begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 노션 35번: QR 웹 화면이 영수증 티켓(카테고리·결제 시각·품목 전부·내 몫)을 세 단계 공통으로 그린다.
-- 방 R: a(민지)·b(지훈). b가 결제한 2품목 식비 지출(30,000 + 12,001원)에 이 자리 정산을 연다.
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.m(l text) returns uuid language sql as $$
  select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid(l);
$$;
create function pg_temp.tok() returns text language sql as $$
  select token from public.spot_settles where id = current_setting('t.spot')::uuid $$;
create function pg_temp.v(p_member uuid default null) returns jsonb language sql as $$
  select public.spot_public_view(pg_temp.tok(), p_member) $$;

select pg_temp.as_user('a');
select set_config('t.r', public.create_room('오사카 3일', 'KRW', '2025-10-20', '2025-10-22')::text, true);
select pg_temp.as_user('b');
select public.join_room((select invite_token from public.rooms where id = pg_temp.r()));
select set_config('t.s', public.save_schedule_item(jsonb_build_object(
  'room_id', pg_temp.r(), 'day_index', 1, 'start_time', '18:30', 'title', '도톤보리 석식'))::text, true);
select set_config('t.e', gen_random_uuid()::text, true);
select public.save_expense(jsonb_build_object(
  'id', current_setting('t.e'), 'room_id', pg_temp.r(), 'payer_kind', 'member', 'payer_member_id', pg_temp.m('b'),
  'source', 'manual', 'merchant', '이치란', 'paid_local_date', '2025-10-20', 'paid_local_time', '19:05',
  'currency', 'KRW', 'category', 'food',
  'scope_member_ids', jsonb_build_array(pg_temp.m('a'), pg_temp.m('b')),
  'items', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', 'ラーメン', 'name_ko', '라멘', 'amount_original', 30000),
    jsonb_build_object('id', gen_random_uuid(), 'position', 1, 'name_original', '맥주', 'amount_original', 12001))));
select public.set_expense_meta(current_setting('t.e')::uuid, current_setting('t.s')::uuid);
select pg_temp.as_user('a');  -- 처음 참여자 = 연 사람(a) + 결제자(b)
select set_config('t.spot', (public.open_spot_settle(current_setting('t.s')::uuid) ->> 'id'), true);
reset role;

-- ───── 참여 전 ─────
select is(pg_temp.v() ->> 'category', 'food', '카테고리를 준다');
select is(pg_temp.v() ->> 'paid_local_time', '19:05', '결제 시각을 HH:MM으로 준다');
select is(jsonb_array_length(pg_temp.v() -> 'receipt'), 2, '참여 전에도 품목을 전부 준다');
select is(pg_temp.v() -> 'receipt' -> 0,
  jsonb_build_object('name', '라멘', 'name_original', 'ラーメン', 'currency', 'KRW',
                     'amount_original', 30000, 'krw', 30000, 'n', 3),
  '품목: 한국어명·원어명·결제 통화 금액·원화·나누는 인원(참여 전에는 나를 더한 3명)');
select is(pg_temp.v() -> 'receipt' -> 1 -> 'name_original', 'null'::jsonb,
  '원어명이 품목명과 같으면 원어명은 비운다');
select is((pg_temp.v() ->> 'share_preview')::bigint, 14000::bigint,
  '참여 전 내 몫 미리보기 = floor(30000/3) + floor(12001/3) = 10000 + 4000');
select is(pg_temp.v() -> 'items', '[]'::jsonb, '기존 items 의미는 그대로다(참여 전 빈 배열)');
select is(pg_temp.v() -> 'receipt' -> 0 -> 'assignees', null, '누가 먹었는지(사람)는 주지 않는다');

-- ───── 참여 후 ─────
select set_config('t.q', (public.spot_join(pg_temp.tok(), '김하늘') ->> 'member_id'), true);
select is((pg_temp.v(current_setting('t.q')::uuid) -> 'receipt' -> 0 ->> 'n')::int, 3,
  '참여 후에는 실제 참여자 수(3명)로 센다');
select is(pg_temp.v(current_setting('t.q')::uuid) -> 'share_preview', 'null'::jsonb,
  '참여 후에는 미리보기 대신 my_share를 쓴다');
select is((pg_temp.v(current_setting('t.q')::uuid) ->> 'my_share')::bigint, 14000::bigint,
  '참여 후 내 몫은 기존 계산 그대로');

select ok(not has_function_privilege('service_role', 'public._spot_public_view_base(text, uuid)', 'execute'),
  '바탕 함수는 service_role도 직접 부르지 않는다(공개 함수는 spot_public_view 하나)');

select * from finish();
rollback;
