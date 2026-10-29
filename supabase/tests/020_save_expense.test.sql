begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- ───── fixture (superuser) ─────
-- A·B: 활성 멤버, C: 비멤버, D: 나간 멤버, G: 게스트(대표 A)
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"nickname":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"nickname":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"nickname":"Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"nickname":"Dave"}');

-- 2025-10-17(금)·10-20(월) 고시, 10-18·19는 주말
insert into public.fx_rates (base_date, currency, rate) values
  ('2025-10-17', 'JPY', 9.123456), ('2025-10-20', 'JPY', 9.2), ('2025-10-20', 'USD', 1328.5), ('2025-10-01', 'EUR', 1500);

-- 기본 payload: 결제자 A, 대상 A·B, 품목은 금액 배열 순서대로 position 0..
create function pg_temp.pl(p_currency text, p_date text, p_amounts numeric[], p_extra jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_object(
    'id', gen_random_uuid(), 'room_id', current_setting('t.room'),
    'payer_kind', 'member', 'payer_member_id', current_setting('t.ma'),
    'source', 'manual', 'merchant', '가게', 'paid_local_date', p_date, 'currency', p_currency,
    'scope_member_ids', jsonb_build_array(current_setting('t.ma'), current_setting('t.mb')),
    'items', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'position', o - 1, 'name_original', '품목' || o,
                                                  'amount_original', a) order by o)
              from unnest(p_amounts) with ordinality u(a, o))
  ) || p_extra;
$$;
create function pg_temp.krws(p_expense_id text) returns bigint[] language sql as $$
  select array_agg(krw_amount order by position) from public.expense_items where expense_id = p_expense_id::uuid;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('t.room', public.create_room('도쿄', 'JPY')::text, true);
select set_config('t.token', (select invite_token from public.rooms where id = current_setting('t.room')::uuid), true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.join_room(current_setting('t.token'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select public.join_room(current_setting('t.token'));
reset role;
update public.room_members set left_at = now()
  where room_id = current_setting('t.room')::uuid and user_id = '00000000-0000-0000-0000-00000000000d';
select set_config('t.ma', (select id::text from public.room_members where room_id = current_setting('t.room')::uuid
  and user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.mb', (select id::text from public.room_members where room_id = current_setting('t.room')::uuid
  and user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.md', (select id::text from public.room_members where room_id = current_setting('t.room')::uuid
  and user_id = '00000000-0000-0000-0000-00000000000d'), true);
insert into public.room_members (room_id, kind, guest_name, representative_member_id, created_by)
  values (current_setting('t.room')::uuid, 'guest', '엄마', current_setting('t.ma')::uuid, '00000000-0000-0000-0000-00000000000a');
select set_config('t.mg', (select id::text from public.room_members where room_id = current_setting('t.room')::uuid
  and kind = 'guest'), true);

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.save_expense(jsonb,integer)', 'execute'), 'anon save_expense 실행 불가');
select ok(not has_function_privilege('anon', 'public.delete_expense(uuid,integer)', 'execute'), 'anon delete_expense 실행 불가');
select ok(not has_function_privilege('anon', 'public.reconfirm_pending_fx(uuid)', 'execute'), 'anon reconfirm_pending_fx 실행 불가');
select ok(not has_function_privilege('anon', 'public.expense_history(uuid)', 'execute'), 'anon expense_history 실행 불가');
select ok(not has_function_privilege('authenticated', 'public._lookup_fx(text,date)', 'execute'), '내부 헬퍼 _lookup_fx 실행 불가');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}')),
  'P0001', 'FORBIDDEN', '비로그인 저장 거부');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}')),
  'P0001', 'FORBIDDEN', '비멤버 저장 거부');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- ───── KRW ─────
select set_config('t.k', public.save_expense(pg_temp.pl('KRW', '2025-10-20', '{5000,7000.5}'))::text, true);
select is(current_setting('t.k')::jsonb - 'id',
  '{"version":1,"krw_amount":12001,"fx_source":"krw","fx_rate":1,"fx_base_date":null}'::jsonb, 'KRW: x.5는 올림, fx_source krw');
select is(pg_temp.krws(current_setting('t.k')::jsonb ->> 'id'), '{5000,7001}'::bigint[], 'KRW: 남은 1원은 소수부 큰 박스로');
select is((select amount_original from public.expenses where id = (current_setting('t.k')::jsonb ->> 'id')::uuid),
  12000.5::numeric, 'amount_original = Σ items');

-- ───── 수출입은행 캐시 ─────
select set_config('t.j', pg_temp.pl('JPY', '2025-10-20', '{1000}')::text, true);
select set_config('t.jr', public.save_expense(current_setting('t.j')::jsonb)::text, true);
select is(current_setting('t.jr')::jsonb - 'id',
  '{"version":1,"krw_amount":9200,"fx_source":"kexim","fx_rate":9.2,"fx_base_date":"2025-10-20"}'::jsonb, 'JPY 캐시 적중');
select is(public.save_expense(pg_temp.pl('JPY', '2025-10-19', '{1000}')) - 'id' - 'version',
  '{"krw_amount":9123,"fx_source":"kexim","fx_rate":9.123456,"fx_base_date":"2025-10-17"}'::jsonb, '주말 결제 → 직전 고시일');
select is((public.save_expense(pg_temp.pl('USD', '2025-10-20', '{1}')) ->> 'krw_amount')::bigint, 1329::bigint, '1328.5 → 1329(0.5 올림)');
select is((public.save_expense(pg_temp.pl('USD', '2025-10-20', '{0.999}')) ->> 'krw_amount')::bigint, 1327::bigint, '1327.17 → 1327');
select is(public.save_expense(pg_temp.pl('EUR', '2025-10-11', '{10}')) ->> 'fx_base_date', '2025-10-01', '10일 전 고시는 사용');
select set_config('t.pend', public.save_expense(pg_temp.pl('EUR', '2025-10-12', '{10,20.5}'))::text, true);
select is(current_setting('t.pend')::jsonb - 'id',
  '{"version":1,"krw_amount":null,"fx_source":"pending","fx_rate":null,"fx_base_date":null}'::jsonb, '11일 전만 있음 → pending');
select is(pg_temp.krws(current_setting('t.pend')::jsonb ->> 'id'), '{NULL,NULL}'::bigint[], 'pending이면 박스 krw NULL');

-- ───── 최대 잔여 배분 ─────
-- 배열 순서와 무관하게 동점이면 position 작은 박스가 먼저
select set_config('t.tie', public.save_expense(pg_temp.pl('JPY', '2025-10-20', '{1}', jsonb_build_object('krw_charged', 100,
  'items', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'position', 2, 'name_original', 'c', 'amount_original', 1),
    jsonb_build_object('id', gen_random_uuid(), 'position', 1, 'name_original', 'b', 'amount_original', 1),
    jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', 'a', 'amount_original', 1)))))::text, true);
select is(pg_temp.krws(current_setting('t.tie')::jsonb ->> 'id'), '{34,33,33}'::bigint[], '동점 → position 순');
select set_config('t.neg', public.save_expense(pg_temp.pl('KRW', '2025-10-20', '{10000,-1000.5}'))::text, true);
select is((current_setting('t.neg')::jsonb ->> 'krw_amount')::bigint, 9000::bigint, '할인 박스 포함 지출 원화');
select is(pg_temp.krws(current_setting('t.neg')::jsonb ->> 'id'), '{10001,-1001}'::bigint[], '음수 할인 박스는 floor(-1000.56 → -1001)');
select set_config('t.mix', public.save_expense(pg_temp.pl('JPY', '2025-10-17', '{333.3,333.3,333.4,0.001}'))::text, true);
select is((select sum(krw_amount)::bigint from public.expense_items where expense_id = (current_setting('t.mix')::jsonb ->> 'id')::uuid),
  (current_setting('t.mix')::jsonb ->> 'krw_amount')::bigint, 'Σ 박스 krw = 지출 krw');

-- ───── 검증 에러 ─────
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000,-1000}')),
  'P0001', 'AMOUNT_INVALID', '원본 합계 0 거부');
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{}')),
  'P0001', 'AMOUNT_INVALID', '품목 0개 거부');
select throws_ok(format('select public.save_expense(%L::jsonb)',
  pg_temp.pl('KRW', ((now() at time zone 'Asia/Seoul')::date + 2)::text, '{1000}')), 'P0001', 'DATE_IN_FUTURE', 'KST 오늘+2 거부');
select lives_ok(format('select public.save_expense(%L::jsonb)',
  pg_temp.pl('KRW', ((now() at time zone 'Asia/Seoul')::date + 1)::text, '{1000}')), 'KST 오늘+1 허용');
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}', '{"scope_member_ids":[]}')),
  'P0001', 'SCOPE_EMPTY', '대상 인원 0명 거부');
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}',
  jsonb_build_object('payer_member_id', current_setting('t.md')))), 'P0001', 'MEMBER_LEFT', '나간 결제자 거부');
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}',
  jsonb_build_object('scope_member_ids', jsonb_build_array(current_setting('t.ma'), current_setting('t.md'))))),
  'P0001', 'MEMBER_LEFT', '나간 대상 인원 거부');
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}',
  jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', 'x',
    'amount_original', 1000, 'assignee_member_ids', jsonb_build_array(current_setting('t.md'))))))),
  'P0001', 'MEMBER_LEFT', '나간 박스 지정 거부');
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}',
  '{"payer_kind":"pool","payer_member_id":null}')), 'P0001', 'INVALID_PAYER', '공금 꺼짐 + 공금 결제 거부');
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}',
  '{"payer_member_id":null}')), 'P0001', 'INVALID_PAYER', '결제자 없는 member 결제 거부');
select throws_ok(format('select public.save_expense(%L::jsonb)', pg_temp.pl('KRW', '2025-10-20', '{1000}',
  '{"photos":[{"storage_path":"x/y/z.jpg","kind":"receipt"}]}')), 'P0001', 'INVALID_INPUT', '잘못된 사진 경로 거부');
select set_config('t.ph', pg_temp.pl('KRW', '2025-10-20', '{1000}')::text, true);
select set_config('t.phr', public.save_expense(current_setting('t.ph')::jsonb || jsonb_build_object('photos', jsonb_build_array(
  jsonb_build_object('storage_path', current_setting('t.room') || '/' || (current_setting('t.ph')::jsonb ->> 'id') || '/'
    || gen_random_uuid() || '.jpg', 'kind', 'receipt'))))::text, true);
select is((select count(*)::int from public.expense_photos where expense_id = (current_setting('t.phr')::jsonb ->> 'id')::uuid),
  1, '올바른 사진 경로 저장');

-- ───── 게스트·클라이언트 원화 무시 ─────
select set_config('t.g', public.save_expense(pg_temp.pl('KRW', '2025-10-20', '{3000}', jsonb_build_object(
  'payer_member_id', current_setting('t.mg'),
  'scope_member_ids', jsonb_build_array(current_setting('t.ma'), current_setting('t.mg')))))::text, true);
select is((select payer_member_id::text from public.expenses where id = (current_setting('t.g')::jsonb ->> 'id')::uuid),
  current_setting('t.mg'), '게스트 결제자·대상 인원 허용');
select is((public.save_expense(pg_temp.pl('KRW', '2025-10-20', '{500}', '{"krw_amount":999999}')) ->> 'krw_amount')::bigint,
  500::bigint, 'payload의 krw_amount 무시');

-- ───── 멱등·버전 ─────
select is((public.save_expense(current_setting('t.j')::jsonb) ->> 'version')::int, 1, '같은 id 재전송 → 기존 결과');
select is((select count(*)::int from public.expenses where id = (current_setting('t.j')::jsonb ->> 'id')::uuid)
  + (select count(*)::int from public.expense_history where expense_id = (current_setting('t.j')::jsonb ->> 'id')::uuid),
  2, '재전송: 지출 1건, 이력 1건');
select throws_ok(format('select public.save_expense(%L::jsonb, 5)', current_setting('t.j')),
  'P0001', 'VERSION_CONFLICT', '잘못된 expected_version');
select throws_ok(format('select public.save_expense(%L::jsonb, 1)', pg_temp.pl('KRW', '2025-10-20', '{1000}')),
  'P0001', 'VERSION_CONFLICT', '없는 지출에 expected_version');

-- 고시값이 바뀌어도 결제일·통화·원본 금액이 그대로면 기존 환율 유지
reset role;
update public.fx_rates set rate = 9.9 where base_date = '2025-10-20' and currency = 'JPY';
set local role authenticated;
select is(public.save_expense(current_setting('t.j')::jsonb || jsonb_build_object('merchant', '이치란', 'items', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '라멘', 'amount_original', 400),
    jsonb_build_object('id', gen_random_uuid(), 'position', 1, 'name_original', '맥주', 'amount_original', 600))), 1) - 'id',
  '{"version":2,"krw_amount":9200,"fx_source":"kexim","fx_rate":9.2,"fx_base_date":"2025-10-20"}'::jsonb, '갱신: version+1, 환율 유지');
select is(pg_temp.krws(current_setting('t.j')::jsonb ->> 'id'), '{3680,5520}'::bigint[], '갱신: 박스 교체·재배분');
select is((select array_agg(action order by at) from public.expense_history where expense_id = (current_setting('t.j')::jsonb ->> 'id')::uuid),
  '{create,update}'::text[], '갱신: 이력 2건');
select is(public.save_expense(pg_temp.pl('JPY', '2025-10-20', '{2000}', jsonb_build_object('id', current_setting('t.j')::jsonb ->> 'id')), 2) - 'id',
  '{"version":3,"krw_amount":19800,"fx_source":"kexim","fx_rate":9.9,"fx_base_date":"2025-10-20"}'::jsonb, '원본 금액 변경 → 재확정');

-- ───── 다른 환율 근거 ─────
select is(public.save_expense(pg_temp.pl('JPY', '2025-10-20', '{1000}', '{"krw_charged":9500}')) - 'id' - 'version',
  '{"krw_amount":9500,"fx_source":"card_krw","fx_rate":null,"fx_base_date":null}'::jsonb, 'krw_charged → card_krw');
select is(public.save_expense(pg_temp.pl('JPY', '2025-10-20', '{1000}', '{"manual_rate":9.5}')) - 'id' - 'version',
  '{"krw_amount":9500,"fx_source":"manual","fx_rate":9.5,"fx_base_date":null}'::jsonb, 'manual_rate → manual');
reset role;
insert into public.room_fx_overrides (room_id, currency, rate) values (current_setting('t.room')::uuid, 'VND', 0.055);
set local role authenticated;
select is(public.save_expense(pg_temp.pl('VND', '2025-10-20', '{100000}')) - 'id' - 'version',
  '{"krw_amount":5500,"fx_source":"manual","fx_rate":0.055,"fx_base_date":null}'::jsonb, '방 수동 환율 → manual');

-- ───── 삭제·이력 ─────
select throws_ok(format('select public.delete_expense(%L, 1)', current_setting('t.j')::jsonb ->> 'id'),
  'P0001', 'VERSION_CONFLICT', '삭제: 잘못된 version');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok(format('select public.delete_expense(%L, 3)', current_setting('t.j')::jsonb ->> 'id'),
  'P0001', 'FORBIDDEN', '비멤버 삭제 거부');
select throws_ok(format('select public.expense_history(%L)', current_setting('t.j')::jsonb ->> 'id'),
  'P0001', 'FORBIDDEN', '비멤버 이력 조회 거부');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok(format('select public.delete_expense(%L, 3)', current_setting('t.j')::jsonb ->> 'id'), '남의 지출 삭제');
select is((select count(*)::int from public.expenses where id = (current_setting('t.j')::jsonb ->> 'id')::uuid), 0, '삭제 후 피드 SELECT 0행');
select is((select array_agg(h ->> 'action') from public.expense_history((current_setting('t.j')::jsonb ->> 'id')::uuid) h),
  '{create,update,update,delete}'::text[], '삭제된 지출 이력 조회');
select is((select h ->> 'actor_nickname' || '|' || jsonb_array_length(h -> 'snapshot' -> 'items') || '|' || (h -> 'snapshot' ->> 'deleted_at' is not null)
  from public.expense_history((current_setting('t.j')::jsonb ->> 'id')::uuid) h where h ->> 'action' = 'delete'),
  'Bob|1|true', '삭제 이력: 행위자 닉네임, 스냅샷에 박스 포함');
select is((select h ->> 'actor_nickname' from public.expense_history((current_setting('t.j')::jsonb ->> 'id')::uuid) h
  where h ->> 'action' = 'create'), 'Alice', '생성 이력 행위자');

-- ───── 환율 재확정 ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok(format('select public.reconfirm_pending_fx(%L)', current_setting('t.room')), 'P0001', 'FORBIDDEN', '비멤버 재확정 거부');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
reset role;
insert into public.fx_rates (base_date, currency, rate) values ('2025-10-10', 'EUR', 1400);
set local role authenticated;
select is(public.reconfirm_pending_fx(current_setting('t.room')::uuid), 1, '재확정 1건');
select is((select fx_source || '|' || krw_amount || '|' || fx_base_date || '|' || version from public.expenses
  where id = (current_setting('t.pend')::jsonb ->> 'id')::uuid), 'kexim|42700|2025-10-10|2', 'pending → kexim, version+1');
select is(pg_temp.krws(current_setting('t.pend')::jsonb ->> 'id'), '{14000,28700}'::bigint[], '재확정: 박스 배분');
select is(public.reconfirm_pending_fx(current_setting('t.room')::uuid), 0, '재확정할 것 없음');

select * from finish();
rollback;
