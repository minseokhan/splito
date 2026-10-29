begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ───── fixture: 방 R(a,b,c), d는 비멤버. A가 3000 결제 → A +2000, B −1000, C −1000 ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c,d}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.m(l text) returns uuid language sql as $$
  select id from public.room_members where room_id = current_setting('t.r')::uuid and user_id = pg_temp.uid(l);
$$;
-- 사용자 l 권한으로 owner의 계좌 조회
create function pg_temp.get(l text, p_owner text) returns table(registered boolean, bank_name text, holder_name text,
  account_masked text, account_number text) language plpgsql as $$
begin
  perform pg_temp.as_user(l);
  return query select * from public.get_payout_account(current_setting('t.r')::uuid, pg_temp.m(p_owner));
end $$;

select pg_temp.as_user('a');
select set_config('t.r', public.create_room('계좌', 'KRW')::text, true);
select pg_temp.as_user('b');
select public.join_room((select invite_token from public.rooms where id = current_setting('t.r')::uuid));
select pg_temp.as_user('c');
select public.join_room((select invite_token from public.rooms where id = current_setting('t.r')::uuid));
select pg_temp.as_user('a');
select public.save_expense(jsonb_build_object(
  'id', gen_random_uuid(), 'room_id', current_setting('t.r')::uuid, 'payer_kind', 'member', 'payer_member_id', pg_temp.m('a'),
  'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
  'scope_member_ids', jsonb_build_array(pg_temp.m('a'), pg_temp.m('b'), pg_temp.m('c')),
  'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
                                                'amount_original', 3000, 'assignee_member_ids', '[]'::jsonb))));

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.set_payout_account(text,text,text,text)', 'execute'), 'anon set 불가');
select ok(not has_function_privilege('anon', 'public.get_payout_account(uuid,uuid)', 'execute'), 'anon get 불가');
select ok(not has_function_privilege('anon', 'public.request_payout_account(uuid,uuid)', 'execute'), 'anon request 불가');
select ok(has_function_privilege('authenticated', 'public.get_payout_account(uuid,uuid)', 'execute'), 'authenticated get 가능');

-- ───── 저장 ─────
select pg_temp.as_user('a');
select throws_ok($$select public.set_payout_account('090', '카카오뱅크', 'A', '1234-567')$$, 'P0001', 'INVALID_INPUT', '숫자 7자리 거부');
select throws_ok($$select public.set_payout_account('090', '카카오뱅크', 'A', '123456789012345678901')$$, 'P0001', 'INVALID_INPUT', '숫자 21자리 거부');
select throws_ok($$select public.set_payout_account('090', '카카오뱅크', 'A', '3333 01 1234567')$$, 'P0001', 'INVALID_INPUT', '공백 거부');
select throws_ok($$select public.set_payout_account('090', '카카오뱅크', 'A', '3333-01-12a4567')$$, 'P0001', 'INVALID_INPUT', '문자 거부');
select lives_ok($$select public.set_payout_account('090', '카카오뱅크', 'A', '1111-01-1111111')$$, 'a 저장');
select lives_ok($$select public.set_payout_account('090', '카카오뱅크', '에이', '3333-01-1234567')$$, 'a 재저장(upsert)');
select is((select count(*)::int from public.payout_accounts where user_id = pg_temp.uid('a')), 1, '본인 행 1개');
select is((select holder_name from public.payout_accounts where user_id = pg_temp.uid('a')), '에이', 'upsert 갱신');
select is((select account_last4::text from public.payout_accounts where user_id = pg_temp.uid('a')), '4567', 'last4');
select is((select position(convert_to('1234567', 'UTF8') in account_enc) from public.payout_accounts where user_id = pg_temp.uid('a')),
          0, '암호문에 평문 없음');
select is((select extensions.pgp_sym_decrypt(account_enc, (select decrypted_secret from vault.decrypted_secrets where name = 'payout_account_key'))
           from public.payout_accounts where user_id = pg_temp.uid('a')), '3333-01-1234567', 'Vault 키로 복호화');
select pg_temp.as_user('b');
select public.set_payout_account('004', '국민은행', '비', '123456789012');

-- ───── 조회 조건 ─────
select pg_temp.as_user('c');
select throws_ok(format('select * from public.get_payout_account(%L, %L)', current_setting('t.r'), gen_random_uuid()),
                 'P0001', 'FORBIDDEN', '방에 없는 주인 거부');
select results_eq($$select registered, bank_name, account_masked, account_number from pg_temp.get('b', 'a')$$,
                  $$values (true, '카카오뱅크', '****-**-***4567', '3333-01-1234567')$$, '줄 사람(b) → 받을 사람(a) 원문');
select results_eq($$select account_masked, account_number from pg_temp.get('a', 'b')$$,
                  $$values ('****-**-***9012', null::text)$$, '받을 사람(a) → b 마스킹');
select results_eq($$select account_number from pg_temp.get('c', 'b')$$,
                  $$values (null::text)$$, '둘 다 줄 사람이면 마스킹');
select results_eq($$select account_number from pg_temp.get('b', 'b')$$,
                  $$values ('123456789012')$$, '본인 계좌는 항상 원문');
select results_eq($$select registered, bank_name, account_masked, account_number from pg_temp.get('a', 'c')$$,
                  $$values (false, null::text, null::text, null::text)$$, '미등록');
select pg_temp.as_user('d');
select throws_ok(format('select * from public.get_payout_account(%L, %L)', current_setting('t.r'), pg_temp.m('a')),
                 'P0001', 'FORBIDDEN', '비멤버 조회 거부');

-- ───── reveal 기록·이벤트 (b → a 원문 1회만 기록, 본인·마스킹은 기록 없음) ─────
select is((select count(*)::int from public.payout_reveals where room_id = current_setting('t.r')::uuid), 1, 'reveal 1건');
select is((select viewer_id from public.payout_reveals), pg_temp.uid('b'), 'reveal viewer');
select is((select owner_id from public.payout_reveals), pg_temp.uid('a'), 'reveal owner');
select is((select count(*)::int from public.room_events where kind = 'payout_reveal'), 1, 'payout_reveal 이벤트 1건');
select is((select target_member_id from public.room_events where kind = 'payout_reveal'), pg_temp.m('a'), '이벤트 target = 주인');
select is((select actor_id from public.room_events where kind = 'payout_reveal'), pg_temp.uid('b'), '이벤트 actor = 조회자');
select is((select payload from public.room_events where kind = 'payout_reveal'), '{}'::jsonb, '이벤트에 계좌 없음');

-- ───── 하루 20회 한도 ─────
select pg_temp.get('b', 'a') from generate_series(2, 20);
select is((select count(*)::int from public.payout_reveals), 20, '20회까지 허용');
select pg_temp.as_user('b');
select throws_ok(format('select * from public.get_payout_account(%L, %L)', current_setting('t.r'), pg_temp.m('a')),
                 'P0001', 'RATE_LIMITED', '21회째 RATE_LIMITED');
update public.payout_reveals set at = at - interval '1 day';
select results_eq($$select account_number from pg_temp.get('b', 'a')$$, $$values ('3333-01-1234567')$$, '다음 날은 다시 허용');

-- ───── 계좌 요청 ─────
select pg_temp.as_user('b');
select lives_ok(format('select public.request_payout_account(%L, %L)', current_setting('t.r'), pg_temp.m('c')), '계좌 요청');
select is((select target_member_id from public.room_events where kind = 'payout_request'), pg_temp.m('c'), '요청 이벤트 target');
select pg_temp.as_user('d');
select throws_ok(format('select public.request_payout_account(%L, %L)', current_setting('t.r'), pg_temp.m('c')),
                 'P0001', 'FORBIDDEN', '비멤버 요청 거부');

-- ───── 직접 SELECT·쓰기 ─────
set local role authenticated;
select pg_temp.as_user('b');
select results_eq($$select user_id from public.payout_accounts$$, $$values (pg_temp.uid('b'))$$, '직접 SELECT는 본인 행만');
select throws_ok($$update public.payout_accounts set holder_name = 'x'$$, '42501', null, '직접 UPDATE 거부');
select is((select count(*)::int from public.payout_reveals), 0, 'payout_reveals 직접 SELECT 불가');

select * from finish();
rollback;
