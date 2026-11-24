begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ───── fixture: 방 R(a,b). a가 3000 결제 → 정산이 남은 상태에서도 탈퇴할 수 있다(노션 26번) ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;

select pg_temp.as_user('a');
select set_config('t.r', public.create_room('탈퇴', 'KRW')::text, true);
select pg_temp.as_user('b');
select public.join_room((select invite_token from public.rooms where id = current_setting('t.r')::uuid));

-- 계좌·푸시 토큰은 superuser로 직접 심는다(암호화 RPC는 060에서 따로 검증).
insert into public.payout_accounts (user_id, bank_code, bank_name, holder_name, account_enc, account_last4)
values (pg_temp.uid('a'), '092', '토스뱅크', 'A', '\x00', '5678');
insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[a]', pg_temp.uid('a'), 'ios');

-- ───── 권한 ─────
select is(has_function_privilege('anon', 'public.delete_my_account()', 'execute'), false, 'anon은 delete_my_account를 실행할 수 없다');
select is(has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'), true, 'authenticated는 실행할 수 있다');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok('select public.delete_my_account()', 'P0001', 'UNAUTHENTICATED', '로그인하지 않으면 UNAUTHENTICATED');

-- ───── 탈퇴 ─────
select pg_temp.as_user('a');
select lives_ok('select public.delete_my_account()', '정산이 남아 있어도 탈퇴할 수 있다');

select is((select count(*)::int from auth.users where id = pg_temp.uid('a')), 0, '로그인 계정(auth.users)을 지운다');
select isnt((select deleted_at from public.profiles where id = pg_temp.uid('a')), null, '프로필은 남기고 deleted_at을 찍는다');
select is((select nickname from public.profiles where id = pg_temp.uid('a')), '', '닉네임을 비운다');
select is((select count(*)::int from public.payout_accounts where user_id = pg_temp.uid('a')), 0, '받을 계좌를 지운다');
select is((select count(*)::int from public.push_tokens where user_id = pg_temp.uid('a')), 0, '푸시 토큰을 지운다');
select is((select count(*)::int from public.room_members where user_id = pg_temp.uid('a')), 1, '방 멤버(장부)는 남긴다');

-- 동행에게는 프로필이 안 보여 '탈퇴한 사용자'로 표시된다(api.roomMembers의 기본값).
select pg_temp.as_user('b');
select is((select count(*)::int from public.member_profiles where id = pg_temp.uid('a')), 0, '동행에게 탈퇴한 사람의 프로필은 안 보인다');
select is((select count(*)::int from public.member_profiles where id = pg_temp.uid('b')), 1, '남은 사람 프로필은 그대로 보인다');

select * from finish();
rollback;
