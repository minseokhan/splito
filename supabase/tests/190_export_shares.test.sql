begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ───── fixture (superuser + jwt claims로 RPC 호출) ─────
-- 사용자 a~f. 시나리오마다 방을 따로 만든다. 게스트·공금·송금·나가기는 아직 RPC가 없어 직접 넣는다.
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c,d,e,f}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_owner(p_room uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select owner_id from public.rooms where id = p_room), 'role', 'authenticated')::text, true);
$$;
-- 첫 사용자가 방장, 나머지는 링크로 합류
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
create function pg_temp.guest(p_room uuid, p_name text, p_rep uuid) returns uuid language sql as $$
  insert into public.room_members (room_id, kind, guest_name, representative_member_id)
  values (p_room, 'guest', p_name, p_rep) returning id;
$$;
-- 지출 저장(방장 권한). p_payer null = 공금. p_assign[i] = i번째 박스 지정 인원(jsonb 배열, 없으면 전원)
create function pg_temp.exp(p_room uuid, p_payer uuid, p_scope uuid[], p_amounts numeric[],
                            p_assign jsonb default '[]', p_currency text default 'KRW') returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_owner(p_room);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', p_room, 'payer_kind', case when p_payer is null then 'pool' else 'member' end,
    'payer_member_id', p_payer, 'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20',
    'currency', p_currency, 'scope_member_ids', to_jsonb(p_scope),
    'items', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'position', o - 1, 'name_original', '품목' || o,
                'amount_original', a, 'assignee_member_ids', coalesce(nullif(p_assign -> (o::int - 1), 'null'), '[]')) order by o)
              from unnest(p_amounts) with ordinality u(a, o))));
  return v_id;
end $$;
create function pg_temp.shares(p_room uuid, p_exp uuid, p_members uuid[]) returns bigint[] language plpgsql as $$
begin
  return (select array_agg(coalesce((select s.share from public.export_expense_shares(p_room) s
                                     where s.expense_id = p_exp and s.member_id = u.mid), 0) order by o)
          from unnest(p_members) with ordinality u(mid, o));
end $$;

-- ───── 권한 ─────
select is(has_function_privilege('anon', 'public.export_expense_shares(uuid)', 'execute'), false, 'anon은 실행할 수 없다');

select set_config('t.r', pg_temp.room('셋이서', '{a,b,c}')::text, true);
select set_config('t.a', pg_temp.m(current_setting('t.r')::uuid, 'a')::text, true);
select set_config('t.b', pg_temp.m(current_setting('t.r')::uuid, 'b')::text, true);
select set_config('t.c', pg_temp.m(current_setting('t.r')::uuid, 'c')::text, true);

-- 1/N 10,000원(a 결제): 3,333 ×3 + 자투리 1원은 결제자
select set_config('t.e1', pg_temp.exp(current_setting('t.r')::uuid, current_setting('t.a')::uuid,
  array[current_setting('t.a'), current_setting('t.b'), current_setting('t.c')]::uuid[], '{10000}')::text, true);
-- 품목별(b 결제): 6,000원은 a·b, 3,000원은 c만
select set_config('t.e2', pg_temp.exp(current_setting('t.r')::uuid, current_setting('t.b')::uuid,
  array[current_setting('t.a'), current_setting('t.b'), current_setting('t.c')]::uuid[], '{6000,3000}',
  jsonb_build_array(jsonb_build_array(current_setting('t.a'), current_setting('t.b')), jsonb_build_array(current_setting('t.c'))))::text, true);

select pg_temp.as_user('a');
select is(pg_temp.shares(current_setting('t.r')::uuid, current_setting('t.e1')::uuid,
  array[current_setting('t.a'), current_setting('t.b'), current_setting('t.c')]::uuid[]),
  '{3334,3333,3333}'::bigint[], '1/N: 자투리는 결제자 몫');
select is(pg_temp.shares(current_setting('t.r')::uuid, current_setting('t.e2')::uuid,
  array[current_setting('t.a'), current_setting('t.b'), current_setting('t.c')]::uuid[]),
  '{3000,3000,3000}'::bigint[], '품목별: 고른 품목 금액만');

-- 공동 지출 몫 합 = room_balances.owed (송금·공금 없음)
select is((select array_agg(x.s order by x.mid) from (
             select s.member_id as mid, sum(s.share)::bigint as s from public.export_expense_shares(current_setting('t.r')::uuid) s
             group by s.member_id) x),
          (select array_agg(b.owed order by b.member_id) from public.room_balances(current_setting('t.r')::uuid) b where b.owed <> 0),
  '사람별 몫 합계가 정산(room_balances)의 owed와 같다');
select is((select count(*) from (select s.expense_id from public.export_expense_shares(current_setting('t.r')::uuid) s
             join public.expenses x on x.id = s.expense_id group by s.expense_id, x.krw_amount
             having sum(s.share) <> x.krw_amount) z), 0::bigint, '지출마다 몫 합 = 원화 금액');

-- 나만 보기: 올린 사람만 본다
select pg_temp.as_user('b');
select public.save_expense(jsonb_build_object(
  'id', '99999999-9999-4999-8999-999999999999', 'room_id', current_setting('t.r'), 'payer_kind', 'member',
  'payer_member_id', current_setting('t.b'), 'source', 'manual', 'merchant', '혼자', 'paid_local_date', '2025-10-20',
  'currency', 'KRW', 'visibility', 'private', 'scope_member_ids', jsonb_build_array(current_setting('t.b')),
  'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '간식', 'amount_original', 5000))));
select is(pg_temp.shares(current_setting('t.r')::uuid, '99999999-9999-4999-8999-999999999999',
  array[current_setting('t.b')]::uuid[]), '{5000}'::bigint[], '내 나만 보기 지출은 내 몫으로 나온다');
select pg_temp.as_user('a');
select is((select count(*) from public.export_expense_shares(current_setting('t.r')::uuid)
           where expense_id = '99999999-9999-4999-8999-999999999999'), 0::bigint, '남의 나만 보기 지출은 안 나온다');

select pg_temp.as_user('d');
select throws_ok(format('select * from public.export_expense_shares(%L)', current_setting('t.r')), 'P0001', 'FORBIDDEN',
  '방 참여자가 아니면 FORBIDDEN');

select * from finish();
rollback;
