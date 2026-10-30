begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ───── fixture (superuser + jwt claims로 RPC 호출) ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c,d,e}'::text[]) l;

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
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.m(l text) returns uuid language sql as $$
  select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid(l);
$$;
-- 1박스 지출 저장. p_payer null = 공금
create function pg_temp.exp(l text, p_payer uuid, p_amount numeric) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', pg_temp.r(), 'payer_kind', case when p_payer is null then 'pool' else 'member' end,
    'payer_member_id', p_payer, 'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20',
    'currency', 'KRW', 'scope_member_ids', to_jsonb(array[pg_temp.m('a'), pg_temp.m('b'), pg_temp.m('c'), pg_temp.m('d')]),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
                                                  'amount_original', p_amount, 'assignee_member_ids', '[]'::jsonb))));
  return v_id;
end $$;
create function pg_temp.deps(p_rows jsonb) returns void language sql as $$
  select public.upsert_pool_deposits(pg_temp.r(), p_rows);
$$;

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.set_pool(uuid,boolean,uuid,text[])', 'execute'), 'anon set_pool 불가');
select ok(not has_function_privilege('anon', 'public.upsert_pool_deposits(uuid,jsonb)', 'execute'), 'anon upsert_pool_deposits 불가');
select ok(has_function_privilege('authenticated', 'public.set_pool(uuid,boolean,uuid,text[])', 'execute'), 'authenticated set_pool 가능');

-- 방 R(a,b,c,d), e는 비멤버
select set_config('t.r', pg_temp.room('공금', '{a,b,c,d}')::text, true);

-- ───── set_pool 검증 ─────
select pg_temp.as_user('e');
select throws_ok(format('select public.set_pool(%L, true, %L, null)', pg_temp.r(), pg_temp.m('b')), 'P0001', 'FORBIDDEN', '비멤버 거부');
select pg_temp.as_user('c');
select throws_ok(format('select public.set_pool(%L, true, null, null)', pg_temp.r()), 'P0001', 'INVALID_INPUT', '켤 때 통장 주인 필수');
select set_config('t.g', public.add_guest(pg_temp.r(), '엄마')::text, true);
select throws_ok(format('select public.set_pool(%L, true, %L, null)', pg_temp.r(), current_setting('t.g')),
  'P0001', 'INVALID_INPUT', '게스트 통장 주인 거부');
select throws_ok(format('select public.set_pool(%L, true, %L, null)', pg_temp.r(), gen_random_uuid()),
  'P0001', 'INVALID_INPUT', '없는·다른 방 통장 주인 거부');
select throws_ok(format('select public.set_pool(%L, true, %L, %L)', pg_temp.r(), pg_temp.m('b'), '{123a}'),
  'P0001', 'INVALID_INPUT', '카드 끝자리 형식 거부');
select throws_ok(format('select public.set_pool(%L, true, %L, %L)', pg_temp.r(), pg_temp.m('b'), '{1111,2222,3333,4444,5555,6666}'),
  'P0001', 'INVALID_INPUT', '카드 끝자리 6개 거부');

-- 공금이 꺼져 있으면 입금 불가
select throws_ok(format('select public.upsert_pool_deposits(%L, %L)', pg_temp.r(),
  jsonb_build_array(jsonb_build_object('member_id', pg_temp.m('a'), 'amount_krw', 1000))), 'P0001', 'INVALID_PAYER', '꺼진 공금 입금 거부');

-- 켜기(멤버 c가 호출, 통장 주인 B)
select lives_ok(format('select public.set_pool(%L, true, %L, %L)', pg_temp.r(), pg_temp.m('b'), '{1234,5678}'), '공금 켜기');
select is((select pool_enabled::text || '|' || pool_owner_member_id || '|' || pool_card_last4::text from public.rooms where id = pg_temp.r()),
  'true|' || pg_temp.m('b') || '|{1234,5678}', '켜기 반영');
select is((select count(*)::int from public.room_events where room_id = pg_temp.r() and kind = 'pool_owner_change'), 0,
  '처음 켤 때는 주인 변경 이벤트 없음');

-- ───── upsert_pool_deposits ─────
select throws_ok(format('select public.upsert_pool_deposits(%L, %L)', pg_temp.r(),
  jsonb_build_array(jsonb_build_object('member_id', pg_temp.m('a'), 'amount_krw', -1))), 'P0001', 'INVALID_INPUT', '음수 입금 거부');
select throws_ok(format('select public.upsert_pool_deposits(%L, %L)', pg_temp.r(),
  jsonb_build_array(jsonb_build_object('member_id', pg_temp.m('a'), 'amount_krw', 1.5))), 'P0001', 'INVALID_INPUT', '소수 입금 거부');
select throws_ok(format('select public.upsert_pool_deposits(%L, %L)', pg_temp.r(),
  jsonb_build_array(jsonb_build_object('member_id', gen_random_uuid(), 'amount_krw', 1000))), 'P0001', 'INVALID_INPUT', '방 밖 참여자 거부');

-- 게스트 입금 허용, 같은 사람 재입력은 합계를 그 값으로 맞춘다(사람당 1행)
select lives_ok(format('select pg_temp.deps(%L)', jsonb_build_array(
  jsonb_build_object('member_id', pg_temp.m('a'), 'amount_krw', 100000),
  jsonb_build_object('member_id', current_setting('t.g'), 'amount_krw', 5000))), '게스트 포함 입금');
select pg_temp.deps(jsonb_build_array(jsonb_build_object('member_id', pg_temp.m('a'), 'amount_krw', 200000)));
select is((select array_agg(amount_krw) from public.pool_deposits where member_id = pg_temp.m('a')), '{200000}'::bigint[],
  '재입력: 사람당 1행, 값으로 덮어씀');
select pg_temp.deps(jsonb_build_array(jsonb_build_object('member_id', current_setting('t.g'), 'amount_krw', 0)));
select is((select count(*)::int from public.pool_deposits where member_id = current_setting('t.g')::uuid), 0, '0원은 행 삭제');

-- ───── PRD F7 예시 2를 RPC로만: 4명 20만씩, 공금 카드 70만, A 개인 12만, 통장 주인 B ─────
select pg_temp.deps(jsonb_build_array(
  jsonb_build_object('member_id', pg_temp.m('b'), 'amount_krw', 200000),
  jsonb_build_object('member_id', pg_temp.m('c'), 'amount_krw', 200000),
  jsonb_build_object('member_id', pg_temp.m('d'), 'amount_krw', 200000)));
select pg_temp.exp('c', null, 700000);
select pg_temp.exp('d', pg_temp.m('a'), 120000);
select pg_temp.as_user('a');
select is((select array_agg(b.net order by o) from unnest(array[pg_temp.m('a'), pg_temp.m('b'), pg_temp.m('c'), pg_temp.m('d')])
           with ordinality u(mid, o) join public.room_balances(pg_temp.r(), false) b on b.member_id = u.mid),
  '{115000,-105000,-5000,-5000}'::bigint[], 'F7 예시 2: A +11.5만, B −10.5만, C −0.5만, D −0.5만');

-- ───── 끄기 차단 ─────
select throws_ok(format('select public.set_pool(%L, false, null, null)', pg_temp.r()), 'P0001', 'POOL_IN_USE', '공금 사용 중 끄기 거부');

-- ───── 통장 주인 leave → POOL_OWNER ─────
select pg_temp.as_user('b');
select throws_ok(format('select public.leave_room(%L)', pg_temp.r()), 'P0001', 'POOL_OWNER', '통장 주인 나가기 거부');

-- ───── 통장 주인 변경 이벤트 ─────
select pg_temp.as_user('a');
select lives_ok(format('select public.set_pool(%L, true, %L, %L)', pg_temp.r(), pg_temp.m('c'), '{1234}'), '통장 주인 B → C');
select is((select actor_id || '|' || (payload ->> 'from') || '|' || (payload ->> 'to') from public.room_events
           where room_id = pg_temp.r() and kind = 'pool_owner_change'),
  pg_temp.uid('a') || '|' || pg_temp.m('b') || '|' || pg_temp.m('c'), 'pool_owner_change {from, to}');

-- 나간 멤버는 통장 주인·입금 불가
select set_config('t.r', pg_temp.room('나감', '{a,b}')::text, true);
select pg_temp.as_user('b');
select public.leave_room(pg_temp.r());
select pg_temp.as_user('a');
select throws_ok(format('select public.set_pool(%L, true, %L, null)', pg_temp.r(), pg_temp.m('b')), 'P0001', 'INVALID_INPUT', '나간 멤버 통장 주인 거부');
select public.set_pool(pg_temp.r(), true, pg_temp.m('a'), null);
select throws_ok(format('select public.upsert_pool_deposits(%L, %L)', pg_temp.r(),
  jsonb_build_array(jsonb_build_object('member_id', pg_temp.m('b'), 'amount_krw', 1000))), 'P0001', 'MEMBER_LEFT', '나간 멤버 입금 거부');

-- 기록이 없으면 끌 수 있고, 주인·카드가 비워진다
select lives_ok(format('select public.set_pool(%L, false, null, null)', pg_temp.r()), '기록 없으면 끄기');
select is((select pool_enabled::text || '|' || coalesce(pool_owner_member_id::text, '-') || '|' || pool_card_last4::text
           from public.rooms where id = pg_temp.r()), 'false|-|{}', '끄면 주인·카드 초기화');

select * from finish();
rollback;
