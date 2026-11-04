begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- ───── fixture (040과 같은 방식) ─────
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
create function pg_temp.exp(p_room uuid, l text, p_amount numeric) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', p_room, 'payer_kind', 'member', 'payer_member_id', pg_temp.m(p_room, l),
    'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
    'scope_member_ids', (select jsonb_agg(id) from public.room_members where room_id = p_room and left_at is null),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
                                                  'amount_original', p_amount, 'assignee_member_ids', '[]'::jsonb))));
  return v_id;
end $$;
create function pg_temp.spent(p_room uuid, l text) returns bigint language plpgsql as $$
begin
  perform pg_temp.as_user(l);
  return (select my_spent from public.my_rooms() where room_id = p_room);
end $$;

-- ───── 내부 함수는 직접 부를 수 없다 ─────
select is(has_function_privilege('authenticated', 'public._my_room_spent(uuid)', 'execute'), false,
  '_my_room_spent는 authenticated가 직접 못 부른다');
select is(has_function_privilege('anon', 'public.my_rooms()', 'execute'), false,
  'anon은 my_rooms를 못 부른다');

-- ───── 지출이 없으면 0 ─────
select set_config('t.r', pg_temp.room('셋이서', '{a,b,c}')::text, true);
select is(pg_temp.spent(current_setting('t.r')::uuid, 'a'), 0::bigint, '지출이 없으면 내 지출 금액은 0');

-- ───── 3명 1/N: 자투리는 결제자가 진다 ─────
select pg_temp.exp(current_setting('t.r')::uuid, 'a', 10000);
select is(pg_temp.spent(current_setting('t.r')::uuid, 'a'), 3334::bigint, '결제자 A는 몫 3333 + 자투리 1');
select is(pg_temp.spent(current_setting('t.r')::uuid, 'b'), 3333::bigint, 'B는 3333');
select is(
  pg_temp.spent(current_setting('t.r')::uuid, 'a')
  + pg_temp.spent(current_setting('t.r')::uuid, 'b')
  + pg_temp.spent(current_setting('t.r')::uuid, 'c'),
  10000::bigint, '세 사람 몫의 합이 지출 총액과 같다');

-- ───── 내 지출 금액은 순잔액과 다른 값이다 ─────
select is(
  (select my_net <> my_spent from public.my_rooms() where room_id = current_setting('t.r')::uuid),
  true, '내 지출 금액은 순잔액과 같지 않다(A는 net +6666, spent 3334)');

select * from finish();
rollback;
