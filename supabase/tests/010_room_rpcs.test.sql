begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- ───── fixture (superuser) ─────
-- A: 방장, B: 새 합류자, D: 나갔다 재합류, C: 비방장 멤버
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"nickname":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"nickname":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"nickname":"Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"nickname":"Dave"}');

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.create_room(text,text,date,date)', 'execute'), 'anon create_room 실행 불가');
select ok(not has_function_privilege('anon', 'public.preview_invite(text)', 'execute'), 'anon preview_invite 실행 불가');
select ok(not has_function_privilege('anon', 'public.join_room(text)', 'execute'), 'anon join_room 실행 불가');
select ok(not has_function_privilege('anon', 'public.update_room(uuid,text,text,date,date)', 'execute'), 'anon update_room 실행 불가');
select ok(not has_function_privilege('anon', 'public.rotate_invite(uuid)', 'execute'), 'anon rotate_invite 실행 불가');
select ok(has_function_privilege('authenticated', 'public.join_room(text)', 'execute'), 'authenticated join_room 실행 가능');

-- ───── 비로그인 ─────
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.create_room('여행', 'JPY')$$, 'P0001', 'FORBIDDEN', '비로그인 create_room 거부');
select throws_ok($$select public.join_room('x')$$, 'P0001', 'FORBIDDEN', '비로그인 join_room 거부');

-- ───── create_room (A) ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('t.room', public.create_room('오사카 3박4일', 'JPY', '2026-10-20', '2026-10-23')::text, true);
select set_config('t.token', (select invite_token from public.rooms where id = current_setting('t.room')::uuid), true);

select is((select owner_id from public.rooms where id = current_setting('t.room')::uuid),
  '00000000-0000-0000-0000-00000000000a'::uuid, '생성자가 방장');
select is((select count(*)::int from public.room_members
  where room_id = current_setting('t.room')::uuid and user_id = auth.uid() and kind = 'user' and left_at is null),
  1, '생성자가 활성 멤버');
select matches(current_setting('t.token'), '^[A-Za-z0-9_-]{22}$', '토큰 22자 URL-safe');
select is((select base_currency::text || name from public.rooms where id = current_setting('t.room')::uuid),
  'JPY오사카 3박4일', '이름·통화 저장');

select throws_ok($$select public.create_room('', 'JPY')$$, 'P0001', 'INVALID_INPUT', '빈 이름 거부');
select throws_ok($$select public.create_room(repeat('가', 31), 'JPY')$$, 'P0001', 'INVALID_INPUT', '31자 이름 거부');
select throws_ok($$select public.create_room('여행', 'jpy')$$, 'P0001', 'INVALID_INPUT', '소문자 통화 거부');
select throws_ok($$select public.create_room('여행', 'JPY', '2026-10-23', '2026-10-20')$$, 'P0001', 'INVALID_INPUT', '시작일 > 종료일 거부');
select isnt((select invite_token from public.rooms where id = public.create_room('다른 여행', 'KRW')),
  current_setting('t.token'), '방마다 다른 토큰');

-- ───── preview_invite ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(public.preview_invite(current_setting('t.token')),
  jsonb_build_object('room_id', current_setting('t.room')::uuid, 'room_name', '오사카 3박4일',
                     'inviter_nickname', 'Alice', 'member_count', 1, 'already_member', false),
  'preview: 유효 토큰 결과');
select throws_ok($$select public.preview_invite('AAAAAAAAAAAAAAAAAAAAAA')$$, 'P0001', 'INVITE_INVALID', 'preview: 없는 토큰');

-- ───── join_room ─────
select is(public.join_room(current_setting('t.token')), current_setting('t.room')::uuid, 'join: room_id 반환');
select is((select count(*)::int from public.room_members where room_id = current_setting('t.room')::uuid and user_id = auth.uid()),
  1, 'join: 멤버 추가');
select is((select count(*)::int from public.room_events where room_id = current_setting('t.room')::uuid and kind = 'join'
  and actor_id = auth.uid()), 1, 'join: room_event 1건');
select is(public.join_room(current_setting('t.token')), current_setting('t.room')::uuid, 'join 재호출: room_id 반환');
select is((select count(*)::int from public.room_members where room_id = current_setting('t.room')::uuid and user_id = auth.uid()),
  1, 'join 재호출: 멤버 중복 없음');
select is((select count(*)::int from public.room_events where room_id = current_setting('t.room')::uuid and kind = 'join'
  and actor_id = auth.uid()), 1, 'join 재호출: room_event 중복 없음');
select is((public.preview_invite(current_setting('t.token')) ->> 'already_member')::boolean, true, 'preview: 이미 멤버');
select is((public.preview_invite(current_setting('t.token')) ->> 'member_count')::int, 2, 'preview: 활성 참여자 수');

-- 나갔다 재합류 (D)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select public.join_room(current_setting('t.token'));
reset role;
update public.room_members set left_at = now(), joined_at = '2026-10-01'
  where room_id = current_setting('t.room')::uuid and user_id = '00000000-0000-0000-0000-00000000000d';
select set_config('t.dmember', (select id::text from public.room_members
  where room_id = current_setting('t.room')::uuid and user_id = '00000000-0000-0000-0000-00000000000d'), true);
set local role authenticated;
select is(public.join_room(current_setting('t.token')), current_setting('t.room')::uuid, '재합류: room_id 반환');
select is((select id || '|' || joined_at::date || '|' || (left_at is null) from public.room_members
  where room_id = current_setting('t.room')::uuid and user_id = auth.uid()),
  current_setting('t.dmember') || '|2026-10-01|true', '재합류: 같은 member id, joined_at 유지, left_at 해제');
select is((select count(*)::int from public.room_members where room_id = current_setting('t.room')::uuid and user_id = auth.uid()),
  1, '재합류: 행 1개');

-- ───── rotate_invite / update_room 권한 ─────
select throws_ok(format('select public.rotate_invite(%L)', current_setting('t.room')), 'P0001', 'FORBIDDEN', '비방장 rotate 거부');
select throws_ok(format('select public.update_room(%L, %L, %L, null, null)', current_setting('t.room'), '바꿈', 'JPY'),
  'P0001', 'FORBIDDEN', '비방장 update 거부');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('t.newtoken', public.rotate_invite(current_setting('t.room')::uuid), true);
select ok(current_setting('t.newtoken') ~ '^[A-Za-z0-9_-]{22}$' and current_setting('t.newtoken') <> current_setting('t.token'),
  'rotate: 새 토큰 발급');
select throws_ok(format('select public.preview_invite(%L)', current_setting('t.token')), 'P0001', 'INVITE_INVALID', 'rotate 후 옛 토큰 preview 무효');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok(format('select public.join_room(%L)', current_setting('t.token')), 'P0001', 'INVITE_INVALID', 'rotate 후 옛 토큰 join 무효');

-- ───── update_room / CURRENCY_LOCKED ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.update_room(current_setting('t.room')::uuid, '오사카', 'KRW', null, null);
select is((select name || base_currency from public.rooms where id = current_setting('t.room')::uuid), '오사카KRW', 'update: 지출 없으면 통화 변경 가능');

reset role;
insert into public.expenses (room_id, created_by, payer_kind, payer_member_id, source, paid_local_date, currency, amount_original, krw_amount, fx_source)
  select current_setting('t.room')::uuid, '00000000-0000-0000-0000-00000000000a', 'member', m.id, 'manual', '2026-10-21', 'KRW', 1000, 1000, 'krw'
  from public.room_members m where m.room_id = current_setting('t.room')::uuid and m.user_id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select throws_ok(format('select public.update_room(%L, %L, %L, null, null)', current_setting('t.room'), '오사카', 'JPY'),
  'P0001', 'CURRENCY_LOCKED', '지출 있는 방 통화 변경 거부');
select lives_ok(format('select public.update_room(%L, %L, %L, null, null)', current_setting('t.room'), '오사카 여행', 'KRW'),
  '지출 있어도 통화 그대로면 이름 변경 가능');

-- ───── 삭제된 방 ─────
reset role;
update public.rooms set deleted_at = now() where id = current_setting('t.room')::uuid;
set local role authenticated;
select throws_ok(format('select public.preview_invite(%L)', current_setting('t.newtoken')), 'P0001', 'INVITE_INVALID', '삭제된 방 preview 무효');

select * from finish();
rollback;
