begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ───── fixture (superuser + jwt claims로 RPC 호출) ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c,d}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.room(p_name text, p_users text[]) returns uuid language plpgsql as $$
declare v_room uuid; l text;
begin
  perform pg_temp.as_user(p_users[1]);
  v_room := public.create_room(p_name, 'KRW');
  foreach l in array p_users[2:] loop
    perform pg_temp.as_user(l);
    perform public.join_room((select invite_token from public.rooms where id = v_room));
  end loop;
  return v_room;
end $$;
create function pg_temp.m(p_room uuid, l text) returns uuid language sql as $$
  select id from public.room_members where room_id = p_room and user_id = pg_temp.uid(l);
$$;
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.g() returns uuid language sql as $$ select current_setting('t.g')::uuid $$;
-- 사용자 l이 결제자 p_payer로 p_scope 대상 1박스 저장
create function pg_temp.exp(l text, p_payer uuid, p_scope uuid[], p_amount numeric) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', pg_temp.r(), 'payer_kind', 'member', 'payer_member_id', p_payer,
    'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
    'scope_member_ids', to_jsonb(p_scope),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
                                                  'amount_original', p_amount, 'assignee_member_ids', '[]'::jsonb))));
  return v_id;
end $$;
create function pg_temp.net(l text) returns bigint language plpgsql as $$
begin
  perform pg_temp.as_user('a');
  return (select net from public.room_balances(pg_temp.r(), false) where member_id = pg_temp.m(pg_temp.r(), l));
end $$;

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.add_guest(uuid,text,uuid)', 'execute'), 'anon add_guest 불가');
select ok(not has_function_privilege('anon', 'public.update_guest(uuid,text,uuid)', 'execute'), 'anon update_guest 불가');
select ok(not has_function_privilege('anon', 'public.remove_guest(uuid)', 'execute'), 'anon remove_guest 불가');
select ok(has_function_privilege('authenticated', 'public.add_guest(uuid,text,uuid)', 'execute'), 'authenticated add_guest 가능');

-- 방 R(a,b,c), d는 비멤버
select set_config('t.r', pg_temp.room('게스트', '{a,b,c}')::text, true);

-- ───── add_guest ─────
select pg_temp.as_user('b');
select set_config('t.g', public.add_guest(pg_temp.r(), '  엄마  ')::text, true);
select is((select kind || '|' || guest_name || '|' || representative_member_id || '|' || created_by
           from public.room_members where id = pg_temp.g()),
  'guest|엄마|' || pg_temp.m(pg_temp.r(), 'b') || '|' || pg_temp.uid('b'), '추가: trim, 대표자 기본값 = 호출자');
select is((select count(*)::int from public.room_events where room_id = pg_temp.r() and kind = 'guest_added'
           and target_member_id = pg_temp.g() and actor_id = pg_temp.uid('b')), 1, 'guest_added 이벤트');

-- 이름 경계
select lives_ok(format('select public.add_guest(%L, %L)', pg_temp.r(), repeat('가', 12)), '이름 12자 허용');
select lives_ok(format('select public.add_guest(%L, %L)', pg_temp.r(), '아'), '이름 1자 허용');
select throws_ok(format('select public.add_guest(%L, %L)', pg_temp.r(), repeat('가', 13)), 'P0001', 'INVALID_INPUT', '이름 13자 거부');
select throws_ok(format('select public.add_guest(%L, %L)', pg_temp.r(), '   '), 'P0001', 'INVALID_INPUT', '공백 이름 거부');
select throws_ok(format('select public.add_guest(%L, null)', pg_temp.r()), 'P0001', 'INVALID_INPUT', 'null 이름 거부');

-- 대표자 지정
select lives_ok(format('select public.add_guest(%L, %L, %L)', pg_temp.r(), '아빠', pg_temp.m(pg_temp.r(), 'c')), '다른 멤버를 대표자로');
select throws_ok(format('select public.add_guest(%L, %L, %L)', pg_temp.r(), '삼촌', pg_temp.g()), 'P0001', 'INVALID_INPUT', '게스트를 대표자로 거부');
select throws_ok(format('select public.add_guest(%L, %L, %L)', pg_temp.r(), '삼촌', gen_random_uuid()), 'P0001', 'INVALID_INPUT', '다른 방·없는 대표자 거부');

-- 비멤버
select pg_temp.as_user('d');
select throws_ok(format('select public.add_guest(%L, %L)', pg_temp.r(), '남'), 'P0001', 'FORBIDDEN', '비멤버 add_guest 거부');
select throws_ok(format('select public.update_guest(%L, %L)', pg_temp.g(), '남'), 'P0001', 'FORBIDDEN', '비멤버 update_guest 거부');

-- ───── update_guest ─────
select pg_temp.as_user('a');
select lives_ok(format('select public.update_guest(%L, %L)', pg_temp.g(), ' 어머니 '), '이름 변경');
select is((select guest_name || '|' || representative_member_id from public.room_members where id = pg_temp.g()),
  '어머니|' || pg_temp.m(pg_temp.r(), 'b'), '이름만 바뀌고 대표자 유지');
select throws_ok(format('select public.update_guest(%L, %L)', pg_temp.g(), repeat('가', 13)), 'P0001', 'INVALID_INPUT', '변경 이름 13자 거부');
select throws_ok(format('select public.update_guest(%L, %L)', pg_temp.m(pg_temp.r(), 'b'), '바꿈'), 'P0001', 'FORBIDDEN', 'user 행 변경 거부');
select throws_ok(format('select public.remove_guest(%L)', pg_temp.m(pg_temp.r(), 'b')), 'P0001', 'FORBIDDEN', 'user 행 삭제 거부');

-- 대표자 변경 시 room_balances 귀속 이동: 게스트가 3000 결제, 대상 a·b·게스트 → 게스트 net +2000
select pg_temp.exp('a', pg_temp.g(), array[pg_temp.m(pg_temp.r(), 'a'), pg_temp.m(pg_temp.r(), 'b'), pg_temp.g()], 3000);
select is(array[pg_temp.net('a'), pg_temp.net('b')], array[-1000, 1000]::bigint[], '대표자 B에게 게스트 +2000 합산');
select pg_temp.as_user('a');
select public.update_guest(pg_temp.g(), null, pg_temp.m(pg_temp.r(), 'a'));
select is(array[pg_temp.net('a'), pg_temp.net('b')], array[1000, -1000]::bigint[], '대표자 A로 변경 → 귀속 이동');
select is((select payload from public.room_events where room_id = pg_temp.r() and kind = 'guest_rep_change' and target_member_id = pg_temp.g()),
  jsonb_build_object('from', pg_temp.m(pg_temp.r(), 'b'), 'to', pg_temp.m(pg_temp.r(), 'a')), 'guest_rep_change 이벤트 {from,to}');

-- ───── remove_guest ─────
select throws_ok(format('select public.remove_guest(%L)', pg_temp.g()), 'P0001', 'GUEST_IN_USE', '결제자로 쓰인 게스트 삭제 거부');
-- 공금 입금에만 쓰인 게스트
select pg_temp.as_user('a');
select set_config('t.g2', public.add_guest(pg_temp.r(), '이모')::text, true);
update public.rooms set pool_enabled = true, pool_owner_member_id = pg_temp.m(pg_temp.r(), 'a') where id = pg_temp.r();
insert into public.pool_deposits (room_id, member_id, amount_krw) values (pg_temp.r(), current_setting('t.g2')::uuid, 1000);
select throws_ok(format('select public.remove_guest(%L)', current_setting('t.g2')), 'P0001', 'GUEST_IN_USE', '공금 입금에 쓰인 게스트 삭제 거부');
-- 미참조 게스트 삭제(이벤트가 있어도)
select set_config('t.g3', public.add_guest(pg_temp.r(), '고모')::text, true);
select public.update_guest(current_setting('t.g3')::uuid, null, pg_temp.m(pg_temp.r(), 'c'));
select lives_ok(format('select public.remove_guest(%L)', current_setting('t.g3')), '미참조 게스트 삭제');
select is((select count(*)::int from public.room_members where id = current_setting('t.g3')::uuid), 0, '행이 지워짐');

-- ───── 나간 멤버를 대표자로 / 대표자의 나가기 ─────
-- c가 대표하는 게스트(아빠) → c는 못 나간다
select pg_temp.as_user('c');
select throws_ok(format('select public.leave_room(%L)', pg_temp.r()), 'P0001', 'GUEST_REPRESENTATIVE', '대표자 leave → GUEST_REPRESENTATIVE');
-- 대표 게스트 넘기고 나가기
select public.update_guest(id, null, pg_temp.m(pg_temp.r(), 'a')) from public.room_members
  where room_id = pg_temp.r() and representative_member_id = pg_temp.m(pg_temp.r(), 'c');
select public.leave_room(pg_temp.r());
select pg_temp.as_user('a');
select throws_ok(format('select public.update_guest(%L, null, %L)', pg_temp.g(), pg_temp.m(pg_temp.r(), 'c')), 'P0001', 'MEMBER_LEFT', '나간 멤버를 대표자로 거부');

-- ───── 게스트를 송금 당사자로 → 거부(기존 검증 재확인) ─────
select throws_ok(format('select public.record_transfer(%L, %L, %L, %L, 1000)', gen_random_uuid(), pg_temp.r(), pg_temp.g(), pg_temp.m(pg_temp.r(), 'a')),
  'P0001', 'FORBIDDEN', '게스트를 송금 당사자로 거부');

select * from finish();
rollback;
