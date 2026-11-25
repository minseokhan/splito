begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ───── fixture (080_guest와 같은 방식: superuser + jwt claims로 RPC 호출) ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c,d}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.g() returns uuid language sql as $$ select current_setting('t.g')::uuid $$;
create function pg_temp.tok() returns text language sql as $$ select invite_token from public.rooms where id = pg_temp.r() $$;
create function pg_temp.code() returns text language sql as $$ select invite_code from public.rooms where id = pg_temp.r() $$;
create function pg_temp.m(l text) returns uuid language sql as $$
  select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid(l);
$$;
create function pg_temp.net_m(p_member uuid) returns bigint language plpgsql as $$
begin
  perform pg_temp.as_user('a');
  return (select net from public.room_balances(pg_temp.r(), false) where member_id = p_member);
end $$;

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.preview_invite_detail(text)', 'execute'), 'anon preview_invite_detail 불가');
select ok(not has_function_privilege('anon', 'public.join_room_as_guest(text,uuid)', 'execute'), 'anon join_room_as_guest 불가');
select ok(not has_function_privilege('anon', 'public.resolve_invite_code(text)', 'execute'), 'anon resolve_invite_code 불가');
select ok(not has_function_privilege('anon', 'public.current_invite(uuid)', 'execute'), 'anon current_invite 불가');
select ok(has_function_privilege('authenticated', 'public.join_room_as_guest(text,uuid)', 'execute'), 'authenticated join_room_as_guest 가능');
select ok(not has_function_privilege('authenticated', 'public._new_invite_code()', 'execute'), '내부 코드 생성기 직접 호출 불가');
select throws_ok($$select public.resolve_invite_code('ABCDEF')$$, 'P0001', 'FORBIDDEN', '비로그인 코드 조회 거부');

-- 방 R: a가 만들고, 게스트 '지훈'을 추가, a가 10000 결제(대상 a·지훈)
select pg_temp.as_user('a');
select set_config('t.r', public.create_room('오사카·교토', 'JPY', '2026-12-01', '2026-12-04')::text, true);
select set_config('t.g', public.add_guest(pg_temp.r(), '지훈')::text, true);
select public.save_expense(jsonb_build_object(
  'id', gen_random_uuid(), 'room_id', pg_temp.r(), 'payer_kind', 'member', 'payer_member_id', pg_temp.m('a'),
  'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
  'scope_member_ids', jsonb_build_array(pg_temp.m('a'), pg_temp.g()),
  'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
                                                'amount_original', 10000, 'assignee_member_ids', '[]'::jsonb))));

-- ───── 코드 발급 ─────
select matches(pg_temp.code(), '^[A-HJ-NP-Z2-9]{6}$', '방을 만들면 6자리 코드가 붙는다(0·O·1·I 제외)');
select ok((select invite_issued_at = now() from public.rooms where id = pg_temp.r()), '발급 시각 = 생성 시각');

-- ───── resolve_invite_code ─────
select pg_temp.as_user('b');
select is(public.resolve_invite_code(' ' || lower(pg_temp.code()) || ' '), pg_temp.tok(), '코드 → 토큰 (소문자·공백 허용)');
select is(public.resolve_invite_code('ZZZZZZ'), null, '없는 코드 → null');
select is((select count(*)::int from public.invite_code_attempts where user_id = pg_temp.uid('b')), 1, '실패 시도가 기록된다');

-- ───── 무차별 대입 제한: 1시간에 실패 10번이면 11번째는 막힌다 ─────
select ok(not has_table_privilege('authenticated', 'public.invite_code_attempts', 'select'), '시도 기록은 클라이언트가 못 읽는다');
select ok(not has_table_privilege('authenticated', 'public.invite_code_attempts', 'insert'), '시도 기록은 클라이언트가 못 쓴다');
select ok((select relrowsecurity from pg_class where oid = 'public.invite_code_attempts'::regclass), '시도 기록 RLS on');
select pg_temp.as_user('c');
select count(public.resolve_invite_code('ZZZZZZ')) from generate_series(1, 10);
select throws_ok(format('select public.resolve_invite_code(%L)', pg_temp.code()), 'P0001', 'TOO_MANY_ATTEMPTS',
  '11번째 시도는 맞는 코드여도 차단');
select is((select count(*)::int from public.invite_code_attempts where user_id = pg_temp.uid('c')), 10, '차단된 시도는 기록을 늘리지 않는다');
select pg_temp.as_user('b');
select is(public.resolve_invite_code(pg_temp.code()), pg_temp.tok(), '다른 사용자는 영향 없음');
update public.invite_code_attempts set attempted_at = now() - interval '61 minutes' where user_id = pg_temp.uid('c');
select pg_temp.as_user('c');
select is(public.resolve_invite_code(pg_temp.code()), pg_temp.tok(), '1시간이 지나면 다시 시도할 수 있다');

-- ───── preview_invite_detail ─────
select is(public.preview_invite_detail(pg_temp.tok()) - 'members' - 'guests',
  jsonb_build_object('room_id', pg_temp.r(), 'room_name', '오사카·교토', 'inviter_nickname', 'A', 'member_count', 2,
                     'already_member', false, 'start_date', '2026-12-01', 'end_date', '2026-12-04',
                     'base_currency', 'JPY', 'expense_count', 1),
  'detail: 여행명·기간·통화·지출 건수');
select is(public.preview_invite_detail(pg_temp.tok()) -> 'members',
  jsonb_build_array(jsonb_build_object('name', 'A', 'guest', false), jsonb_build_object('name', '지훈', 'guest', true)),
  'detail: 동행 이름(방장 먼저, 참여 순)');
select is(public.preview_invite_detail(pg_temp.tok()) -> 'guests',
  jsonb_build_array(jsonb_build_object('member_id', pg_temp.g(), 'name', '지훈')), 'detail: 고를 수 있는 게스트');

-- ───── join_room_as_guest ─────
select is(pg_temp.net_m(pg_temp.g()), -5000::bigint, '연결 전 게스트 지훈 net -5000');
select pg_temp.as_user('b');
select throws_ok(format('select public.join_room_as_guest(%L, %L)', pg_temp.tok(), gen_random_uuid()),
  'P0001', 'JOIN_UNAVAILABLE', '없는(삭제된) 게스트 거부');
select is(public.join_room_as_guest(pg_temp.tok(), pg_temp.g()), pg_temp.r(), '게스트로 참여: room_id 반환');
select is((select kind || '|' || user_id || '|' || coalesce(guest_name, '-') || '|' || coalesce(representative_member_id::text, '-')
           from public.room_members where id = pg_temp.g()),
  'user|' || pg_temp.uid('b') || '|-|-', '게스트 행이 b의 user 참여자로 바뀐다(같은 참여자 ID)');
select is(pg_temp.m('b'), pg_temp.g(), 'b의 참여자 ID = 원래 게스트 ID');
select is(pg_temp.net_m(pg_temp.g()), -5000::bigint, '게스트의 정산 금액이 b에게 그대로 이어진다');
select is((select payload from public.room_events where room_id = pg_temp.r() and kind = 'join' and target_member_id = pg_temp.g()
           and actor_id = pg_temp.uid('b')), jsonb_build_object('guest_name', '지훈'), 'join 이벤트(게스트 이름 기록)');
select throws_ok(format('select public.join_room_as_guest(%L, %L)', pg_temp.tok(), pg_temp.g()),
  'P0001', 'JOIN_UNAVAILABLE', '이미 이 방 참여자면 게스트 연결 거부');
select is((public.preview_invite_detail(pg_temp.tok()) ->> 'already_member')::boolean, true, 'b: 이미 참여');

select pg_temp.as_user('c');
select throws_ok(format('select public.join_room_as_guest(%L, %L)', pg_temp.tok(), pg_temp.g()),
  'P0001', 'JOIN_UNAVAILABLE', '이미 연결된 게스트는 다른 사람이 못 고른다');
select is(public.preview_invite_detail(pg_temp.tok()) -> 'guests', '[]'::jsonb, '남은 게스트 없음');
select is(public.join_room(pg_temp.tok()), pg_temp.r(), '새로 참여(기존 join_room)');

-- 나갔다 다시 오는 사람은 게스트를 고를 수 없다(같은 참여자 ID로 재합류)
select pg_temp.as_user('a');
select set_config('t.g2', public.add_guest(pg_temp.r(), '민지')::text, true);
update public.room_members set left_at = now() where id = pg_temp.m('c');
select pg_temp.as_user('c');
select is(public.preview_invite_detail(pg_temp.tok()) -> 'guests', '[]'::jsonb, '내 행이 있으면 guests 비움');

-- ───── 7일 만료 ─────
update public.rooms set invite_issued_at = now() - interval '7 days' - interval '1 second' where id = pg_temp.r();
select pg_temp.as_user('d');
select throws_ok(format('select public.preview_invite(%L)', pg_temp.tok()), 'P0001', 'INVITE_INVALID', '만료: preview_invite');
select throws_ok(format('select public.preview_invite_detail(%L)', pg_temp.tok()), 'P0001', 'INVITE_INVALID', '만료: detail');
select throws_ok(format('select public.join_room(%L)', pg_temp.tok()), 'P0001', 'INVITE_INVALID', '만료: join_room');
select is(public.resolve_invite_code(pg_temp.code()), null, '만료: 코드 → null');

-- ───── current_invite ─────
select throws_ok(format('select public.current_invite(%L)', pg_temp.r()), 'P0001', 'FORBIDDEN', '비멤버 current_invite 거부');
select set_config('t.old', pg_temp.tok() || '|' || pg_temp.code(), true);
select pg_temp.as_user('b');
select is(public.current_invite(pg_temp.r()) ->> 'token', pg_temp.tok(), 'current_invite: 현재 토큰 반환');
select isnt(pg_temp.tok() || '|' || pg_temp.code(), current_setting('t.old'), '만료됐으면 토큰·코드를 새로 발급');
select pg_temp.as_user('d');
select is(public.join_room(pg_temp.tok()), pg_temp.r(), '새 링크로 참여');

select * from finish();
rollback;
