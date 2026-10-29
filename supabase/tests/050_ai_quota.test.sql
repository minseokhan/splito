begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ───── fixture ─────
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
create function pg_temp.consume(p_room uuid, l text, n int, p_limit int default 100000) returns void language plpgsql as $$
begin
  perform pg_temp.as_user(l);
  for i in 1..n loop perform public.consume_ai_quota(p_room, p_limit); end loop;
end $$;
create function pg_temp.cnt(p_scope text, p_id text) returns int language sql as $$
  select coalesce((select count from public.ai_usage
                   where scope = p_scope and scope_id = p_id and day = (now() at time zone 'Asia/Seoul')::date), 0);
$$;

select set_config('t.r', pg_temp.room('한도', '{a,b,c,d}')::text, true);
select set_config('t.g', '00000000-0000-0000-0000-000000000000', true);

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.consume_ai_quota(uuid,integer)', 'execute'), 'anon 실행 불가');
select ok(has_function_privilege('authenticated', 'public.consume_ai_quota(uuid,integer)', 'execute'), 'authenticated 실행 가능');
select ok(not has_table_privilege('authenticated', 'public.ai_usage', 'insert,update,delete'), 'ai_usage 직접 쓰기 불가');

-- ───── 정상 증가 ─────
select pg_temp.consume(current_setting('t.r')::uuid, 'a', 1);
select is(pg_temp.cnt('user', pg_temp.uid('a')::text), 1, 'user 카운트 1');
select is(pg_temp.cnt('room', current_setting('t.r')), 1, 'room 카운트 1');
select is(pg_temp.cnt('global', current_setting('t.g')), 1, 'global 카운트 1');

-- 클라이언트는 ai_usage를 읽지 못한다(RLS 정책 없음)
select pg_temp.as_user('a');
set local role authenticated;
select is((select count(*) from public.ai_usage), 0::bigint, 'authenticated는 ai_usage 행을 못 본다');
reset role;

-- ───── user 한도: 101번째 거부, 카운트 불변 ─────
select pg_temp.consume(current_setting('t.r')::uuid, 'a', 99);
select is(pg_temp.cnt('user', pg_temp.uid('a')::text), 100, 'user 100회까지 허용');
select pg_temp.as_user('a');
select throws_ok(format('select public.consume_ai_quota(%L, 100000)', current_setting('t.r')),
                 'P0001', 'AI_QUOTA_EXCEEDED', '101번째 user 호출 거부');
select is(pg_temp.cnt('user', pg_temp.uid('a')::text) + pg_temp.cnt('room', current_setting('t.r')) * 1000,
          100 + 100 * 1000, '거부 시 user·room 카운트 증가 안 함');

-- ───── room 한도: 300 초과 거부 ─────
select pg_temp.consume(current_setting('t.r')::uuid, 'b', 100);
select pg_temp.consume(current_setting('t.r')::uuid, 'c', 100);
select pg_temp.as_user('d');
select throws_ok(format('select public.consume_ai_quota(%L, 100000)', current_setting('t.r')),
                 'P0001', 'AI_QUOTA_EXCEEDED', '301번째 room 호출 거부');

-- ───── global 한도 ─────
select set_config('t.r2', pg_temp.room('다른 방', '{e}')::text, true);
select pg_temp.as_user('e');
select throws_ok(format('select public.consume_ai_quota(%L, %s)', current_setting('t.r2'), pg_temp.cnt('global', current_setting('t.g'))),
                 'P0001', 'AI_QUOTA_EXCEEDED', 'global 한도 초과 거부');
select is(pg_temp.cnt('user', pg_temp.uid('e')::text), 0, 'global 거부 시 user 카운트 롤백');

-- ───── 비멤버 거부 ─────
select pg_temp.as_user('e');
select throws_ok(format('select public.consume_ai_quota(%L, 100000)', current_setting('t.r')),
                 'P0001', 'FORBIDDEN', '비멤버 거부');

select * from finish();
rollback;
