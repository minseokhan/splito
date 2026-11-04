begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ───── fixture (040과 같은 방식: superuser + jwt claims) ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c}'::text[]) l;

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
-- 사용자 l이 결제, 활성 참여자 전원 대상 1박스
create function pg_temp.exp(p_room uuid, l text, p_amount numeric, p_currency text default 'KRW') returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', p_room, 'payer_kind', 'member', 'payer_member_id', pg_temp.m(p_room, l),
    'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', p_currency,
    'scope_member_ids', (select jsonb_agg(id) from public.room_members where room_id = p_room and left_at is null),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
                                                  'amount_original', p_amount, 'assignee_member_ids', '[]'::jsonb))));
  return v_id;
end $$;

-- ───── 권한 ─────
select is(
  has_function_privilege('anon', 'public.delete_room(uuid)', 'execute'), false,
  'anon은 delete_room을 실행할 수 없다');
select is(
  has_function_privilege('authenticated', 'public.delete_room(uuid)', 'execute'), true,
  'authenticated는 실행할 수 있다');

-- ───── 방장만 지울 수 있다 ─────
select set_config('t.r', pg_temp.room('둘이서', '{a,b}')::text, true);
select pg_temp.as_user('b');
select throws_ok(format('select public.delete_room(%L)', current_setting('t.r')), 'P0001', 'FORBIDDEN',
  '방장이 아니면 FORBIDDEN');
select pg_temp.as_user('c');
select throws_ok(format('select public.delete_room(%L)', current_setting('t.r')), 'P0001', 'FORBIDDEN',
  '참여자가 아니면 FORBIDDEN');

-- ───── 정산이 남아 있으면 막는다 ─────
select pg_temp.exp(current_setting('t.r')::uuid, 'a', 10000);
select pg_temp.as_user('a');
select throws_ok(format('select public.delete_room(%L)', current_setting('t.r')), 'P0001', 'ROOM_NOT_SETTLED',
  'net ≠ 0 인 참여자가 있으면 ROOM_NOT_SETTLED');
select is((select deleted_at from public.rooms where id = current_setting('t.r')::uuid), null,
  '막힌 삭제는 방을 건드리지 않는다');

-- ───── 환율 미확정 공동 지출도 막는다 (혼자 방은 나만 보기라 visibility='shared'가 아니다) ─────
select set_config('t.fx', pg_temp.room('환율대기', '{a,b}')::text, true);
select pg_temp.exp(current_setting('t.fx')::uuid, 'a', 10, 'USD');
select pg_temp.as_user('a');
select is((select count(*) from public.expenses
           where room_id = current_setting('t.fx')::uuid and fx_source = 'pending' and visibility = 'shared'), 1::bigint,
  '환율 미확정 공동 지출이 1건 있다');
select throws_ok(format('select public.delete_room(%L)', current_setting('t.fx')), 'P0001', 'ROOM_NOT_SETTLED',
  '환율 미확정이 남아 있으면 ROOM_NOT_SETTLED');

-- ───── 혼자인 방은 바로 지워진다 ─────
select set_config('t.s', pg_temp.room('혼자', '{a}')::text, true);
select pg_temp.as_user('a');
select lives_ok(format('select public.delete_room(%L)', current_setting('t.s')), '혼자인 방은 방장이 지울 수 있다');
select isnt((select deleted_at from public.rooms where id = current_setting('t.s')::uuid), null, 'deleted_at이 찍힌다');
select is((select count(*) from public.my_rooms() where room_id = current_setting('t.s')::uuid), 0::bigint,
  '지운 방은 my_rooms에서 사라진다');
select throws_ok(format('select public.delete_room(%L)', current_setting('t.s')), 'P0001', 'FORBIDDEN',
  '이미 지운 방 → FORBIDDEN');

-- ───── 정산이 끝난 여러 명 방도 지울 수 있다 ─────
select set_config('t.d', pg_temp.room('정산끝', '{a,b}')::text, true);
select pg_temp.as_user('a');
select lives_ok(format('select public.delete_room(%L)', current_setting('t.d')),
  '지출이 없어 net이 모두 0이면 여러 명 방도 지울 수 있다');

select * from finish();
rollback;
