begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ───── fixture (150과 같은 방식: superuser + jwt claims) ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c,d}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.m(p_room uuid, l text) returns uuid language sql as $$
  select id from public.room_members where room_id = p_room and user_id = pg_temp.uid(l);
$$;

select pg_temp.as_user('a');
select set_config('t.r', public.create_room('넷이서', 'KRW')::text, true);
select set_config('t.tok', (select invite_token from public.rooms where id = current_setting('t.r')::uuid), true);
select pg_temp.as_user('b');
select public.join_room(current_setting('t.tok'));
select pg_temp.as_user('c');
select public.join_room(current_setting('t.tok'));

-- ───── 권한 ─────
select is(has_function_privilege('anon', 'public.remove_member(uuid, uuid)', 'execute'), false,
  'anon은 remove_member를 실행할 수 없다');
select is(has_function_privilege('authenticated', 'public.remove_member(uuid, uuid)', 'execute'), true,
  'authenticated는 실행할 수 있다');

select pg_temp.as_user('b');
select throws_ok(format('select public.remove_member(%L, %L)', current_setting('t.r'), pg_temp.m(current_setting('t.r')::uuid, 'c')),
  'P0001', 'FORBIDDEN', '방장이 아니면 FORBIDDEN');

select pg_temp.as_user('a');
select throws_ok(format('select public.remove_member(%L, %L)', current_setting('t.r'), pg_temp.m(current_setting('t.r')::uuid, 'a')),
  'P0001', 'FORBIDDEN', '방장 자신은 내보낼 수 없다');
select throws_ok(format('select public.remove_member(%L, %L)', current_setting('t.r'), gen_random_uuid()),
  'P0001', 'FORBIDDEN', '이 방 멤버가 아니면 FORBIDDEN');

-- ───── 게스트 대표·공금 통장 주인은 막는다 ─────
select set_config('t.g', public.add_guest(current_setting('t.r')::uuid, '엄마', pg_temp.m(current_setting('t.r')::uuid, 'c'))::text, true);
select throws_ok(format('select public.remove_member(%L, %L)', current_setting('t.r'), pg_temp.m(current_setting('t.r')::uuid, 'c')),
  'P0001', 'MEMBER_HAS_ROLE', '대표하는 게스트가 있으면 MEMBER_HAS_ROLE');

update public.rooms set pool_owner_member_id = pg_temp.m(id, 'b') where id = current_setting('t.r')::uuid;
select throws_ok(format('select public.remove_member(%L, %L)', current_setting('t.r'), pg_temp.m(current_setting('t.r')::uuid, 'b')),
  'P0001', 'MEMBER_HAS_ROLE', '공금 통장 주인이면 MEMBER_HAS_ROLE');
update public.rooms set pool_owner_member_id = null where id = current_setting('t.r')::uuid;

-- ───── 사용자 내보내기 ─────
select lives_ok(format('select public.remove_member(%L, %L)', current_setting('t.r'), pg_temp.m(current_setting('t.r')::uuid, 'b')),
  '방장은 다른 참여자를 내보낼 수 있다');
select ok((select left_at is not null and removed_by = pg_temp.uid('a') from public.room_members
           where id = pg_temp.m(current_setting('t.r')::uuid, 'b')),
  'left_at과 removed_by가 찍힌다');
select is((select count(*) from public.room_events where room_id = current_setting('t.r')::uuid and kind = 'removed'
             and target_member_id = pg_temp.m(current_setting('t.r')::uuid, 'b')), 1::bigint,
  'removed 이벤트가 남는다');
select isnt((select invite_token from public.rooms where id = current_setting('t.r')::uuid), current_setting('t.tok'),
  '사용자를 내보내면 초대 링크가 재발급된다');
select pg_temp.as_user('d');
select throws_ok(format('select public.join_room(%L)', current_setting('t.tok')), 'P0001', 'INVITE_INVALID',
  '옛 링크로는 들어올 수 없다');
select pg_temp.as_user('b');
select is(public.is_room_member(current_setting('t.r')::uuid), false, '내보낸 사람은 방 멤버가 아니다');

-- ───── 게스트 내보내기 ─────
select pg_temp.as_user('a');
select set_config('t.tok2', (select invite_token from public.rooms where id = current_setting('t.r')::uuid), true);
select lives_ok(format('select public.remove_member(%L, %L)', current_setting('t.r'), current_setting('t.g')),
  '게스트도 내보낼 수 있다');
select is((select invite_token from public.rooms where id = current_setting('t.r')::uuid), current_setting('t.tok2'),
  '게스트를 내보낼 때는 링크를 바꾸지 않는다');
select throws_ok(format('select public.remove_member(%L, %L)', current_setting('t.r'), current_setting('t.g')),
  'P0001', 'FORBIDDEN', '이미 나간 멤버 → FORBIDDEN');

select * from finish();
rollback;
