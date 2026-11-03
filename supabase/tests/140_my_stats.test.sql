begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ───── fixture ─────
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
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.m(l text) returns uuid language sql as $$
  select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid(l);
$$;
-- 1박스 지출. p_scope가 1명이고 결제자도 그 사람이면 save_expense가 '나만 보기'로 판정한다.
create function pg_temp.exp(l text, p_amount numeric, p_cat text, p_date date, p_scope uuid[]) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', pg_temp.r(), 'payer_kind', 'member', 'payer_member_id', pg_temp.m(l),
    'source', 'manual', 'merchant', '가게', 'paid_local_date', p_date, 'currency', 'KRW', 'category', p_cat,
    'scope_member_ids', to_jsonb(p_scope),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0,
      'name_original', '품목', 'amount_original', p_amount, 'assignee_member_ids', '[]'::jsonb))));
  return v_id;
end $$;
create function pg_temp.share(p_id uuid) returns bigint language sql as $$
  select my_share from public.my_expense_shares(pg_temp.r()) where expense_id = p_id;
$$;

-- 방 만들기·참여는 superuser로 한다(RLS 아래서는 비멤버가 invite_token을 못 읽는다).
select set_config('t.r', pg_temp.room('오사카', '{a,b,c,d}')::text, true);
set local role authenticated;

-- ───── 내 몫 집계 ─────
select set_config('t.e1', pg_temp.exp('a', 1000, 'food', '2025-10-20',
  array[pg_temp.m('a'), pg_temp.m('b'), pg_temp.m('c'), pg_temp.m('d')])::text, true);
select pg_temp.as_user('b');
select is(pg_temp.share(current_setting('t.e1')::uuid), 250::bigint, '4인 1/N 1000원이면 내 몫 250원');
select pg_temp.as_user('a');
select is(pg_temp.share(current_setting('t.e1')::uuid), 250::bigint, '결제자도 자투리가 없으면 250원');

-- 자투리(1001 = 250×4 + 1)는 결제자가 진다 — room_balances와 같은 규칙
select set_config('t.e2', pg_temp.exp('a', 1001, 'transport', '2025-10-21',
  array[pg_temp.m('a'), pg_temp.m('b'), pg_temp.m('c'), pg_temp.m('d')])::text, true);
select pg_temp.as_user('a');
select is(pg_temp.share(current_setting('t.e2')::uuid), 251::bigint, '자투리 1원은 결제자 몫');
select pg_temp.as_user('b');
select is(pg_temp.share(current_setting('t.e2')::uuid), 250::bigint, '자투리는 다른 사람에게 가지 않는다');

-- 나만 보기: 본인은 100%, 남은 아예 못 본다
select set_config('t.e3', pg_temp.exp('a', 7000, 'shopping', '2025-10-21', array[pg_temp.m('a')])::text, true);
select is((select visibility from public.expenses where id = current_setting('t.e3')::uuid), 'private',
  '혼자 대상이면 나만 보기로 저장된다');
select pg_temp.as_user('a');
select is(pg_temp.share(current_setting('t.e3')::uuid), 7000::bigint, '나만 보기 지출은 내 몫 100%');
select pg_temp.as_user('b');
select ok(pg_temp.share(current_setting('t.e3')::uuid) is null, '남의 나만 보기 지출은 집계에 없다');

-- 카테고리·날짜가 그대로 내려온다(화면이 기간·카테고리로 접는다)
select pg_temp.as_user('a');
select is((select category from public.my_expense_shares(pg_temp.r()) where expense_id = current_setting('t.e1')::uuid),
  'food', '카테고리가 함께 내려온다');
select is((select paid_local_date from public.my_expense_shares(pg_temp.r()) where expense_id = current_setting('t.e2')::uuid),
  '2025-10-21'::date, '결제일이 함께 내려온다');
select is((select count(*)::int from public.my_expense_shares(pg_temp.r())), 3, 'A는 공동 2건 + 나만 보기 1건');
select pg_temp.as_user('b');
select is((select count(*)::int from public.my_expense_shares(pg_temp.r())), 2, 'B는 공동 2건만');

select pg_temp.as_user('d');
select throws_ok($$select * from public.my_expense_shares('00000000-0000-0000-0000-0000000000ff')$$,
  'P0001', 'FORBIDDEN', '남의 방 집계는 막는다');

-- ───── 예산 ─────
select pg_temp.as_user('a');
select lives_ok($$select public.save_trip_budget(pg_temp.r(), 480000, 'ai',
  '{"food":182400,"transport":38400,"shopping":144000,"sightseeing":96000,"other":19200}'::jsonb)$$,
  '예산을 저장한다');
select is((select total_krw from public.trip_budgets where room_id = pg_temp.r() and user_id = pg_temp.uid('a')),
  480000::bigint, '전체 예산이 저장된다');
select lives_ok($$select public.save_trip_budget(pg_temp.r(), 500000, 'none', null)$$, '다시 저장하면 덮어쓴다');
select is((select total_krw from public.trip_budgets where room_id = pg_temp.r() and user_id = pg_temp.uid('a')),
  500000::bigint, '덮어쓴 값이 남는다');

select throws_ok($$select public.save_trip_budget(pg_temp.r(), 0, 'none', null)$$,
  'P0001', 'AMOUNT_INVALID', '예산 0원은 거부한다');
select throws_ok($$select public.save_trip_budget(pg_temp.r(), 1000, 'manual', '{"cafe":100}'::jsonb)$$,
  'P0001', 'INVALID_INPUT', '모르는 카테고리 키는 거부한다');

-- 다른 사람은 내 예산을 못 읽는다(RLS)
select pg_temp.as_user('b');
select is((select count(*)::int from public.trip_budgets where room_id = pg_temp.r()), 0,
  '예산은 본인만 읽는다');

-- 조정안 적용
select pg_temp.as_user('a');
select public.apply_budget_plan(pg_temp.r(), '{"id":"shopping","title":"쇼핑 지키기"}'::jsonb);
select is((select applied_plan ->> 'id' from public.trip_budgets where room_id = pg_temp.r() and user_id = pg_temp.uid('a')),
  'shopping', '조정안이 저장된다');

-- ───── 홈 카드 패키지 배지 ─────
select is((select has_booking from public.my_rooms() where room_id = pg_temp.r()), false,
  '예약이 없으면 has_booking=false');

select * from finish();
rollback;
