begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

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
create function pg_temp.net(p_room uuid, p_members uuid[], p_confirmed boolean default false) returns bigint[] language plpgsql as $$
begin
  perform pg_temp.as_owner(p_room);
  return (select array_agg(b.net order by o) from unnest(p_members) with ordinality u(mid, o)
          join public.room_balances(p_room, p_confirmed) b on b.member_id = u.mid);
end $$;
create function pg_temp.owed(p_room uuid, p_members uuid[]) returns bigint[] language plpgsql as $$
begin
  perform pg_temp.as_owner(p_room);
  return (select array_agg(b.owed order by o) from unnest(p_members) with ordinality u(mid, o)
          join public.room_balances(p_room) b on b.member_id = u.mid);
end $$;
create function pg_temp.sumnet(p_room uuid) returns bigint language plpgsql as $$
begin
  perform pg_temp.as_owner(p_room);
  return (select sum(net)::bigint from public.room_balances(p_room));
end $$;
create function pg_temp.transfer(p_room uuid, p_from uuid, p_to uuid, p_amount bigint, p_confirmed boolean, p_voided boolean default false)
returns void language sql as $$
  insert into public.transfers (room_id, from_member_id, to_member_id, amount_krw, confirmed_at, voided_at)
  values (p_room, p_from, p_to, p_amount, case when p_confirmed then now() end, case when p_voided then now() end);
$$;

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.room_balances(uuid,boolean)', 'execute'), 'anon room_balances 실행 불가');
select ok(not has_function_privilege('anon', 'public.my_rooms()', 'execute'), 'anon my_rooms 실행 불가');
select ok(has_function_privilege('authenticated', 'public.room_balances(uuid,boolean)', 'execute'), 'authenticated room_balances 실행 가능');
select ok(has_function_privilege('authenticated', 'public.my_rooms()', 'execute'), 'authenticated my_rooms 실행 가능');

-- ───── PRD F7 예시 1: 120만 원, A 60·B 40·C 20·D 0 ─────
select set_config('t.r1', pg_temp.room('예시1', '{a,b,c,d}')::text, true);
select set_config('t.r1m', array[pg_temp.m(current_setting('t.r1')::uuid, 'a'), pg_temp.m(current_setting('t.r1')::uuid, 'b'),
  pg_temp.m(current_setting('t.r1')::uuid, 'c'), pg_temp.m(current_setting('t.r1')::uuid, 'd')]::text, true);
select pg_temp.exp(current_setting('t.r1')::uuid, (current_setting('t.r1m')::uuid[])[1], current_setting('t.r1m')::uuid[], '{600000}');
select pg_temp.exp(current_setting('t.r1')::uuid, (current_setting('t.r1m')::uuid[])[2], current_setting('t.r1m')::uuid[], '{400000}');
select pg_temp.exp(current_setting('t.r1')::uuid, (current_setting('t.r1m')::uuid[])[3], current_setting('t.r1m')::uuid[], '{200000}');
select is(pg_temp.net(current_setting('t.r1')::uuid, current_setting('t.r1m')::uuid[]),
  '{300000,100000,-100000,-300000}'::bigint[], 'F7 예시 1: A +30만, B +10만, C −10만, D −30만');
select is(pg_temp.sumnet(current_setting('t.r1')::uuid), 0::bigint, '예시 1: Σ net = 0');
select pg_temp.as_owner(current_setting('t.r1')::uuid);
select is((select paid || '|' || owed from public.room_balances(current_setting('t.r1')::uuid)
  where member_id = (current_setting('t.r1m')::uuid[])[1]), '600000|300000', '예시 1: A paid·owed');
select is((select array_agg(distinct fx_pending_count) from public.room_balances(current_setting('t.r1')::uuid)), '{0}'::int[], '환율 대기 0건');
select pg_temp.as_user('e');
select throws_ok(format('select * from public.room_balances(%L)', current_setting('t.r1')), 'P0001', 'FORBIDDEN', '비멤버 조회 거부');
select pg_temp.as_user('a');

-- ───── PRD F7 예시 2: 공금 80만(20만×4), 공금 카드 70만, A 개인 12만, 통장 주인 B ─────
select set_config('t.r2', pg_temp.room('예시2', '{a,b,c,d}')::text, true);
select set_config('t.r2m', array[pg_temp.m(current_setting('t.r2')::uuid, 'a'), pg_temp.m(current_setting('t.r2')::uuid, 'b'),
  pg_temp.m(current_setting('t.r2')::uuid, 'c'), pg_temp.m(current_setting('t.r2')::uuid, 'd')]::text, true);
update public.rooms set pool_enabled = true, pool_owner_member_id = (current_setting('t.r2m')::uuid[])[2]
  where id = current_setting('t.r2')::uuid;
insert into public.pool_deposits (room_id, member_id, amount_krw)
  select current_setting('t.r2')::uuid, mid, 200000 from unnest(current_setting('t.r2m')::uuid[]) mid;
select pg_temp.exp(current_setting('t.r2')::uuid, null, current_setting('t.r2m')::uuid[], '{700000}');
select pg_temp.exp(current_setting('t.r2')::uuid, (current_setting('t.r2m')::uuid[])[1], current_setting('t.r2m')::uuid[], '{120000}');
select is(pg_temp.net(current_setting('t.r2')::uuid, current_setting('t.r2m')::uuid[]),
  '{115000,-105000,-5000,-5000}'::bigint[], 'F7 예시 2: A +11.5만, B −10.5만, C −0.5만, D −0.5만');
select is(pg_temp.sumnet(current_setting('t.r2')::uuid), 0::bigint, '예시 2: Σ net = 0 (공금 상계 포함)');
select is((select count(*)::int from public.room_balances(current_setting('t.r2')::uuid)), 4, '공금 행은 반환하지 않는다');
select is(pg_temp.owed(current_setting('t.r2')::uuid, array[(current_setting('t.r2m')::uuid[])[2]]),
  '{305000}'::bigint[], '공금 남음 10만 → 통장 주인 owed에 +');

-- ───── 자투리: 결제자 부담(지정 밖·대상 밖 포함) ─────
select set_config('t.r3', pg_temp.room('자투리', '{a,b,c}')::text, true);
select set_config('t.r3m', array[pg_temp.m(current_setting('t.r3')::uuid, 'a'), pg_temp.m(current_setting('t.r3')::uuid, 'b'),
  pg_temp.m(current_setting('t.r3')::uuid, 'c')]::text, true);
-- A 결제: 1000원 전원(333×3, 자투리 1) + 101원 B·C 지정(50×2, 자투리 1 — A는 지정 밖)
select pg_temp.exp(current_setting('t.r3')::uuid, (current_setting('t.r3m')::uuid[])[1], current_setting('t.r3m')::uuid[], '{1000,101}',
  jsonb_build_array(null, jsonb_build_array((current_setting('t.r3m')::uuid[])[2], (current_setting('t.r3m')::uuid[])[3])));
select is(pg_temp.owed(current_setting('t.r3')::uuid, current_setting('t.r3m')::uuid[]), '{335,383,383}'::bigint[],
  '자투리 2원은 결제자 A(지정 밖 박스 포함)');
-- C 결제: 5원, 대상 A·B(2×2, 자투리 1 — C는 대상 밖)
select pg_temp.exp(current_setting('t.r3')::uuid, (current_setting('t.r3m')::uuid[])[3],
  array[(current_setting('t.r3m')::uuid[])[1], (current_setting('t.r3m')::uuid[])[2]], '{5}');
select is(pg_temp.owed(current_setting('t.r3')::uuid, current_setting('t.r3m')::uuid[]), '{337,385,384}'::bigint[],
  '대상 밖 결제자도 자투리 부담');
select is(pg_temp.net(current_setting('t.r3')::uuid, current_setting('t.r3m')::uuid[]), '{764,-385,-379}'::bigint[], '자투리 방 net');

-- ───── 음수 할인 박스 floor, 지정 ∩ 대상 = ∅ → 대상 전원 ─────
select set_config('t.r4', pg_temp.room('할인', '{a,b,c}')::text, true);
select set_config('t.r4m', array[pg_temp.m(current_setting('t.r4')::uuid, 'a'), pg_temp.m(current_setting('t.r4')::uuid, 'b'),
  pg_temp.m(current_setting('t.r4')::uuid, 'c')]::text, true);
-- -101/3 → floor −34(자투리 +1). 0 쪽 버림(−33, 자투리 −2)이면 실패한다
select pg_temp.exp(current_setting('t.r4')::uuid, (current_setting('t.r4m')::uuid[])[1], current_setting('t.r4m')::uuid[], '{1000,-101}');
select is(pg_temp.owed(current_setting('t.r4')::uuid, current_setting('t.r4m')::uuid[]), '{301,299,299}'::bigint[],
  '음수 할인 박스: floor, 자투리 ≥ 0');
select pg_temp.exp(current_setting('t.r4')::uuid, (current_setting('t.r4m')::uuid[])[1],
  array[(current_setting('t.r4m')::uuid[])[1], (current_setting('t.r4m')::uuid[])[2]], '{100}',
  jsonb_build_array(jsonb_build_array((current_setting('t.r4m')::uuid[])[3])));
select is(pg_temp.owed(current_setting('t.r4')::uuid, current_setting('t.r4m')::uuid[]), '{351,349,299}'::bigint[],
  '지정 ∩ 대상이 비면 대상 전원이 나눈다');
select is(pg_temp.sumnet(current_setting('t.r4')::uuid), 0::bigint, '할인 방: Σ net = 0');

-- ───── 공금 부족(음수), 공금 결제 자투리는 통장 주인 ─────
select set_config('t.r5', pg_temp.room('공금부족', '{a,b}')::text, true);
select set_config('t.r5m', array[pg_temp.m(current_setting('t.r5')::uuid, 'a'), pg_temp.m(current_setting('t.r5')::uuid, 'b')]::text, true);
update public.rooms set pool_enabled = true, pool_owner_member_id = (current_setting('t.r5m')::uuid[])[1]
  where id = current_setting('t.r5')::uuid;
insert into public.pool_deposits (room_id, member_id, amount_krw)
  values (current_setting('t.r5')::uuid, (current_setting('t.r5m')::uuid[])[1], 10000);
select pg_temp.exp(current_setting('t.r5')::uuid, null, current_setting('t.r5m')::uuid[], '{30001}');
-- A owed = 15000 + 자투리 1 + 남은 공금(10000 − 30001) = −5000
select is(pg_temp.owed(current_setting('t.r5')::uuid, current_setting('t.r5m')::uuid[]), '{-5000,15000}'::bigint[],
  '공금 부족: 통장 주인 owed 음수 허용, 공금 자투리는 통장 주인');
select is(pg_temp.net(current_setting('t.r5')::uuid, current_setting('t.r5m')::uuid[]), '{15000,-15000}'::bigint[], '공금 부족: 통장 주인이 받을 돈');
update public.rooms set pool_owner_member_id = null where id = current_setting('t.r5')::uuid;
select pg_temp.as_owner(current_setting('t.r5')::uuid);
select throws_like(format('select * from public.room_balances(%L)', current_setting('t.r5')), '%invariant%',
  'Σ net ≠ 0이면 함수 안에서 예외');
select pg_temp.as_user('a');

-- ───── 합류·나가기 후 기존 분담 불변 ─────
select set_config('t.r6', pg_temp.room('합류', '{a,b}')::text, true);
select set_config('t.r6m', array[pg_temp.m(current_setting('t.r6')::uuid, 'a'), pg_temp.m(current_setting('t.r6')::uuid, 'b')]::text, true);
select pg_temp.exp(current_setting('t.r6')::uuid, (current_setting('t.r6m')::uuid[])[1], current_setting('t.r6m')::uuid[], '{1000}');
select pg_temp.as_user('c');
select public.join_room((select invite_token from public.rooms where id = current_setting('t.r6')::uuid));
select is(pg_temp.net(current_setting('t.r6')::uuid, current_setting('t.r6m')::uuid[] || pg_temp.m(current_setting('t.r6')::uuid, 'c')),
  '{500,-500,0}'::bigint[], '합류 후 기존 지출 분담 불변(새 멤버 0)');
update public.room_members set left_at = now() where id = (current_setting('t.r6m')::uuid[])[2];
select is(pg_temp.net(current_setting('t.r6')::uuid, current_setting('t.r6m')::uuid[]), '{500,-500}'::bigint[],
  '나간 멤버 행도 반환, 분담 불변');
select pg_temp.as_owner(current_setting('t.r6')::uuid);
select is((select left_at is not null from public.room_balances(current_setting('t.r6')::uuid)
  where member_id = (current_setting('t.r6m')::uuid[])[2]), true, '나간 멤버 left_at 반환');

-- ───── 송금 반영·역송금·confirmed_only·무효 ─────
select set_config('t.r7', pg_temp.room('송금', '{a,b}')::text, true);
select set_config('t.r7m', array[pg_temp.m(current_setting('t.r7')::uuid, 'a'), pg_temp.m(current_setting('t.r7')::uuid, 'b')]::text, true);
select pg_temp.exp(current_setting('t.r7')::uuid, (current_setting('t.r7m')::uuid[])[1], current_setting('t.r7m')::uuid[], '{10000}');
select pg_temp.transfer(current_setting('t.r7')::uuid, (current_setting('t.r7m')::uuid[])[2], (current_setting('t.r7m')::uuid[])[1], 5000, true);
select is(pg_temp.net(current_setting('t.r7')::uuid, current_setting('t.r7m')::uuid[]), '{0,0}'::bigint[], '확인된 송금 반영 → 0');
select pg_temp.transfer(current_setting('t.r7')::uuid, (current_setting('t.r7m')::uuid[])[2], (current_setting('t.r7m')::uuid[])[1], 1000, false);
select pg_temp.transfer(current_setting('t.r7')::uuid, (current_setting('t.r7m')::uuid[])[1], (current_setting('t.r7m')::uuid[])[2], 3000, false, true);
select is(pg_temp.net(current_setting('t.r7')::uuid, current_setting('t.r7m')::uuid[]), '{-1000,1000}'::bigint[],
  '확인 대기 송금도 화면 net에 반영 → 역송금, 무효 송금 제외');
select is(pg_temp.net(current_setting('t.r7')::uuid, current_setting('t.r7m')::uuid[], true), '{0,0}'::bigint[],
  'confirmed_only: 확인된 송금만');

-- ───── 1명 방, 환율 대기 제외·카운트, 삭제 지출 제외 ─────
select set_config('t.r8', pg_temp.room('혼자', '{a}')::text, true);
select set_config('t.r8m', array[pg_temp.m(current_setting('t.r8')::uuid, 'a')]::text, true);
select pg_temp.exp(current_setting('t.r8')::uuid, (current_setting('t.r8m')::uuid[])[1], current_setting('t.r8m')::uuid[], '{1000}');
select pg_temp.exp(current_setting('t.r8')::uuid, (current_setting('t.r8m')::uuid[])[1], current_setting('t.r8m')::uuid[], '{50}', '[]', 'EUR');
select set_config('t.r8del', pg_temp.exp(current_setting('t.r8')::uuid, (current_setting('t.r8m')::uuid[])[1],
  current_setting('t.r8m')::uuid[], '{7000}')::text, true);
select public.delete_expense(current_setting('t.r8del')::uuid, 1);
select pg_temp.as_owner(current_setting('t.r8')::uuid);
-- 1명 방의 지출은 결제자=나·대상=나뿐이라 전부 '나만 보기'로 저장된다 → 정산에서 모두 빠진다
select is((select paid || '|' || owed || '|' || net || '|' || fx_pending_count from public.room_balances(current_setting('t.r8')::uuid)),
  '0|0|0|0', '1명 방: 혼자 지출은 전부 나만 보기 → 정산에서 제외');

-- ───── 게스트: 대표자 합산, 게스트 결제자·공금 입금·박스 지정, 대표자 변경 ─────
select set_config('t.r9', pg_temp.room('게스트', '{a,b}')::text, true);
select set_config('t.r9m', array[pg_temp.m(current_setting('t.r9')::uuid, 'a'), pg_temp.m(current_setting('t.r9')::uuid, 'b')]::text, true);
select set_config('t.r9g', pg_temp.guest(current_setting('t.r9')::uuid, '엄마', (current_setting('t.r9m')::uuid[])[1])::text, true);
select set_config('t.r9all', (current_setting('t.r9m')::uuid[] || current_setting('t.r9g')::uuid)::text, true);
-- 게스트 결제 9000: 6000 전원(2000씩) + 3000 게스트 지정
select pg_temp.exp(current_setting('t.r9')::uuid, current_setting('t.r9g')::uuid, current_setting('t.r9all')::uuid[], '{6000,3000}',
  jsonb_build_array(null, jsonb_build_array(current_setting('t.r9g'))));
-- 공금(통장 주인 B): 게스트 입금 3000, 공금 결제 3000 전원
update public.rooms set pool_enabled = true, pool_owner_member_id = (current_setting('t.r9m')::uuid[])[2]
  where id = current_setting('t.r9')::uuid;
insert into public.pool_deposits (room_id, member_id, amount_krw) values (current_setting('t.r9')::uuid, current_setting('t.r9g')::uuid, 3000);
select pg_temp.exp(current_setting('t.r9')::uuid, null, current_setting('t.r9all')::uuid[], '{3000}');
select pg_temp.as_owner(current_setting('t.r9')::uuid);
select is((select paid || '|' || owed || '|' || net || '|' || representative_member_id || '|' || kind
  from public.room_balances(current_setting('t.r9')::uuid) where member_id = current_setting('t.r9g')::uuid),
  '12000|6000|0|' || (current_setting('t.r9m')::uuid[])[1] || '|guest', '게스트 행: 자기 paid·owed, net 0, 대표자');
select is(pg_temp.net(current_setting('t.r9')::uuid, current_setting('t.r9m')::uuid[]), '{3000,-3000}'::bigint[],
  '게스트 몫(+6000)이 대표자 A net에 합산');
select is(pg_temp.sumnet(current_setting('t.r9')::uuid), 0::bigint, '게스트 방: Σ net = 0');
update public.room_members set representative_member_id = (current_setting('t.r9m')::uuid[])[2] where id = current_setting('t.r9g')::uuid;
select is(pg_temp.net(current_setting('t.r9')::uuid, current_setting('t.r9m')::uuid[]), '{-3000,3000}'::bigint[],
  '대표자 변경 → 게스트 귀속이 새 대표자로 이동');

-- ───── my_rooms 상태 판정 ─────
select pg_temp.room('S1 혼자', '{e}');
select pg_temp.room('S2 함께', '{e,f}');
select set_config('t.s3', pg_temp.room('S3 완료', '{e,f}')::text, true);
select pg_temp.exp(current_setting('t.s3')::uuid, pg_temp.m(current_setting('t.s3')::uuid, 'e'),
  array[pg_temp.m(current_setting('t.s3')::uuid, 'e'), pg_temp.m(current_setting('t.s3')::uuid, 'f')], '{1000}');
select pg_temp.transfer(current_setting('t.s3')::uuid, pg_temp.m(current_setting('t.s3')::uuid, 'f'),
  pg_temp.m(current_setting('t.s3')::uuid, 'e'), 500, true);
select set_config('t.s4', pg_temp.room('S4 정산중', '{e,f}')::text, true);
select pg_temp.exp(current_setting('t.s4')::uuid, pg_temp.m(current_setting('t.s4')::uuid, 'e'),
  array[pg_temp.m(current_setting('t.s4')::uuid, 'e'), pg_temp.m(current_setting('t.s4')::uuid, 'f')], '{1000}');
select pg_temp.transfer(current_setting('t.s4')::uuid, pg_temp.m(current_setting('t.s4')::uuid, 'f'),
  pg_temp.m(current_setting('t.s4')::uuid, 'e'), 200, false);
select set_config('t.s5', pg_temp.room('S5 게스트', '{e}')::text, true);
select pg_temp.guest(current_setting('t.s5')::uuid, '아빠', pg_temp.m(current_setting('t.s5')::uuid, 'e'));
select set_config('t.s6', pg_temp.room('S6 삭제', '{e}')::text, true);
update public.rooms set deleted_at = now() where id = current_setting('t.s6')::uuid;
select set_config('t.s7', pg_temp.room('S7 나감', '{f,e}')::text, true);
update public.room_members set left_at = now() where id = pg_temp.m(current_setting('t.s7')::uuid, 'e');
select pg_temp.as_user('e');
select results_eq('select name, status, member_count, total_krw, my_net from public.my_rooms() order by name',
  $$values ('S1 혼자', 'solo', 1, 0::bigint, 0::bigint), ('S2 함께', 'shared', 2, 0::bigint, 0::bigint),
           ('S3 완료', 'settled', 2, 1000::bigint, 0::bigint), ('S4 정산중', 'settling', 2, 1000::bigint, 300::bigint),
           ('S5 게스트', 'shared', 2, 0::bigint, 0::bigint)$$,
  'my_rooms: solo·shared·settled·settling, 게스트 포함 인원, 삭제·나간 방 제외');
select pg_temp.as_user('f');
select is((select status from public.my_rooms() where room_id = current_setting('t.s3')::uuid), 'settled', '상대방에게도 정산 완료');
-- 정산 완료 후 지출 추가 → 정산 중으로 복귀
select pg_temp.exp(current_setting('t.s3')::uuid, pg_temp.m(current_setting('t.s3')::uuid, 'e'),
  array[pg_temp.m(current_setting('t.s3')::uuid, 'e'), pg_temp.m(current_setting('t.s3')::uuid, 'f')], '{400}');
select pg_temp.as_user('e');
select is((select status from public.my_rooms() where room_id = current_setting('t.s3')::uuid), 'settling', '완료 후 지출 추가 → settling');
-- 환율 대기가 있으면 settled 아님
select pg_temp.transfer(current_setting('t.s3')::uuid, pg_temp.m(current_setting('t.s3')::uuid, 'f'),
  pg_temp.m(current_setting('t.s3')::uuid, 'e'), 200, true);
select is((select status from public.my_rooms() where room_id = current_setting('t.s3')::uuid), 'settled', '잔액 0 → 다시 settled');
select pg_temp.exp(current_setting('t.s3')::uuid, pg_temp.m(current_setting('t.s3')::uuid, 'e'),
  array[pg_temp.m(current_setting('t.s3')::uuid, 'e'), pg_temp.m(current_setting('t.s3')::uuid, 'f')], '{10}', '[]', 'EUR');
select pg_temp.as_user('e');
select is((select status from public.my_rooms() where room_id = current_setting('t.s3')::uuid), 'settling', '환율 대기 있으면 settled 아님');
-- ───── 나만 보기 지출은 정산에서 빠진다 (명세 2, AI-14) ─────
select set_config('t.rv', pg_temp.room('나만보기', '{e,f}')::text, true);
select set_config('t.rvm', array[pg_temp.m(current_setting('t.rv')::uuid, 'e'),
  pg_temp.m(current_setting('t.rv')::uuid, 'f')]::text, true);
-- 공동 지출 1000: E 결제, 대상 E·F
select pg_temp.exp(current_setting('t.rv')::uuid, (current_setting('t.rvm')::uuid[])[1], current_setting('t.rvm')::uuid[], '{1000}');
select is(pg_temp.net(current_setting('t.rv')::uuid, current_setting('t.rvm')::uuid[]), '{500,-500}'::bigint[],
  '공동 지출만 있을 때 net');
-- E가 자기 몫만 결제 → save_expense가 private으로 판정한다
select set_config('t.rvp', pg_temp.exp(current_setting('t.rv')::uuid, (current_setting('t.rvm')::uuid[])[1],
  array[(current_setting('t.rvm')::uuid[])[1]], '{2000}')::text, true);
select is((select visibility from public.expenses where id = current_setting('t.rvp')::uuid), 'private',
  '결제자=나·대상=나뿐 → private으로 저장');
select is(pg_temp.net(current_setting('t.rv')::uuid, current_setting('t.rvm')::uuid[]), '{500,-500}'::bigint[],
  '나만 보기 지출을 넣어도 모든 참여자 net 불변');
select is(pg_temp.sumnet(current_setting('t.rv')::uuid), 0::bigint, '나만 보기 방: Σ net = 0');
select pg_temp.as_owner(current_setting('t.rv')::uuid);
select is((select paid || '|' || owed from public.room_balances(current_setting('t.rv')::uuid)
  where member_id = (current_setting('t.rvm')::uuid[])[1]), '1000|500',
  '나만 보기 지출은 paid에도 owed에도 안 들어간다');
-- 총 지출은 사람마다 다르다: 작성자만 자기 나만 보기 금액을 본다
select pg_temp.as_user('e');
select is((select total_krw from public.my_rooms() where room_id = current_setting('t.rv')::uuid), 3000::bigint,
  '총 지출: 작성자는 자기 나만 보기 지출을 포함해서 본다');
select pg_temp.as_user('f');
select is((select total_krw from public.my_rooms() where room_id = current_setting('t.rv')::uuid), 1000::bigint,
  '총 지출: 남의 나만 보기 지출 금액은 합계로도 새지 않는다');
-- 나만 보기 지출의 환율 미확정은 남의 정산을 막지 않는다
select pg_temp.exp(current_setting('t.rv')::uuid, (current_setting('t.rvm')::uuid[])[1],
  array[(current_setting('t.rvm')::uuid[])[1]], '{50}', '[]', 'EUR');
select pg_temp.as_owner(current_setting('t.rv')::uuid);
select is((select array_agg(distinct fx_pending_count) from public.room_balances(current_setting('t.rv')::uuid)), '{0}'::int[],
  '나만 보기 지출의 환율 미확정은 세지 않는다');
-- 공동 지출의 환율 미확정만 센다. 삭제된 공동 지출은 제외
select pg_temp.exp(current_setting('t.rv')::uuid, (current_setting('t.rvm')::uuid[])[1], current_setting('t.rvm')::uuid[], '{50}', '[]', 'EUR');
select set_config('t.rvd', pg_temp.exp(current_setting('t.rv')::uuid, (current_setting('t.rvm')::uuid[])[1],
  current_setting('t.rvm')::uuid[], '{7000}')::text, true);
select public.delete_expense(current_setting('t.rvd')::uuid, 1);
select pg_temp.as_owner(current_setting('t.rv')::uuid);
select is((select paid || '|' || owed || '|' || net || '|' || fx_pending_count
  from public.room_balances(current_setting('t.rv')::uuid) where member_id = (current_setting('t.rvm')::uuid[])[1]),
  '1000|500|500|1', '공동 지출의 환율 대기만 1건, 삭제 지출 제외');
-- 공개 범위가 shared로 바뀌면 그 즉시 정산에 반영된다
select pg_temp.as_owner(current_setting('t.rv')::uuid);
select public.save_expense(jsonb_build_object(
  'id', current_setting('t.rvp'), 'room_id', current_setting('t.rv'), 'payer_kind', 'member',
  'payer_member_id', (current_setting('t.rvm')::uuid[])[1], 'source', 'manual', 'merchant', '가게',
  'paid_local_date', '2025-10-20', 'currency', 'KRW',
  'scope_member_ids', to_jsonb(current_setting('t.rvm')::uuid[]),
  'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0,
    'name_original', '품목', 'amount_original', 2000))), 1);
select is((select visibility from public.expenses where id = current_setting('t.rvp')::uuid), 'shared',
  '대상에 타인을 넣으면 shared');
select is(pg_temp.net(current_setting('t.rv')::uuid, current_setting('t.rvm')::uuid[]), '{1500,-1500}'::bigint[],
  'shared로 바꾸면 그 즉시 정산에 반영');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok('select * from public.my_rooms()', 'P0001', 'FORBIDDEN', '비로그인 my_rooms 거부');

select * from finish();
rollback;
