begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ───── fixture (superuser) ─────
-- 방 R1: A·B 활성, C는 나간 멤버, G는 게스트(대표 A).
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"nickname":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"nickname":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"nickname":"Carol"}');

insert into public.rooms (id, name, base_currency, owner_id, invite_token) values
  ('10000000-0000-0000-0000-000000000001', 'R1', 'KRW', '00000000-0000-0000-0000-00000000000a', 'tok1');

insert into public.room_members (id, room_id, kind, user_id, left_at) values
  ('20000000-0000-0000-0000-00000000001a', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000a', null),
  ('20000000-0000-0000-0000-00000000001b', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000b', null),
  ('20000000-0000-0000-0000-00000000001c', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000c', now());
insert into public.room_members (id, room_id, kind, guest_name, representative_member_id) values
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-000000000001', 'guest', 'G',
   '20000000-0000-0000-0000-00000000001a');

insert into public.push_tokens (token, user_id, platform) values
  ('ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]', '00000000-0000-0000-0000-00000000000b', 'android');

-- ───── 대상자 계산 (superuser) ─────
select is(public._room_user_ids('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  array['00000000-0000-0000-0000-00000000000b']::uuid[],
  '알림 대상은 활성 유저 멤버에서 행위자를 뺀 것 — 게스트·나간 멤버 제외');

-- Vault에 push_endpoint·push_secret이 없는 환경(로컬·CI)에서도 장부 쓰기가 깨지지 않아야 한다.
select lives_ok($$insert into public.expenses (id, room_id, created_by, payer_kind, payer_member_id, source,
    paid_local_date, currency, amount_original, krw_amount, fx_source)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000a', 'member', '20000000-0000-0000-0000-00000000001a', 'manual',
    '2026-10-21', 'KRW', 10000, 10000, 'krw')$$,
  'Vault 시크릿이 없어도 지출 INSERT는 성공한다');
select lives_ok($$insert into public.comments (id, expense_id, room_id, author_id, body)
  values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '댓글')$$,
  'Vault 시크릿이 없어도 댓글 INSERT는 성공한다');

-- 내부 함수를 하나라도 회수에서 빠뜨리면 PostgREST에 RPC로 노출된다. 함수 이름을 일일이 적지 않고
-- '_ 접두 전체'로 건다 — 새 내부 함수를 추가할 때마다 테스트를 고칠 필요가 없다.
select is((select coalesce(array_agg(p.proname::text order by p.proname), '{}')
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like '\_%'
             and (has_function_privilege('anon', p.oid, 'execute')
                  or has_function_privilege('authenticated', p.oid, 'execute'))),
  '{}'::text[], '내부(_ 접두) 함수는 anon·authenticated가 실행할 수 없다');

-- ───── 발송 경로 (Vault 시크릿이 있는 환경) ─────
-- _push는 모든 예외를 삼키므로(장부 쓰기를 막으면 안 된다) 오타·스키마 변경이 조용히 묻힌다.
-- pg_net 큐에 실제로 들어가는지로 확인한다.
select vault.create_secret('http://127.0.0.1:54321/functions/v1/push', 'push_endpoint');
select vault.create_secret('test-secret', 'push_secret');

insert into public.expenses (id, room_id, created_by, payer_kind, payer_member_id, source,
    paid_local_date, currency, amount_original, krw_amount, fx_source)
  values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000a', 'member', '20000000-0000-0000-0000-00000000001a', 'manual',
    '2026-10-21', 'KRW', 20000, 20000, 'krw');
select is((select count(*) from net.http_request_queue)::int, 1, '공동 지출 등록이 푸시 요청을 큐에 넣는다');
select is((select jsonb_build_array(q.b -> 'tokens', q.b ->> 'path')
            from (select convert_from(body, 'UTF8')::jsonb b from net.http_request_queue) q),
  jsonb_build_array(jsonb_build_array('ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]'),
    '/rooms/10000000-0000-0000-0000-000000000001/expenses/30000000-0000-0000-0000-000000000002'),
  '대상자 토큰과 지출 상세 딥링크가 본문에 담긴다');

insert into public.expenses (id, room_id, created_by, payer_kind, payer_member_id, source,
    paid_local_date, currency, amount_original, krw_amount, fx_source, visibility)
  values ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000a', 'member', '20000000-0000-0000-0000-00000000001a', 'manual',
    '2026-10-21', 'KRW', 30000, 30000, 'krw', 'private');
select is((select count(*) from net.http_request_queue)::int, 1, '나만 보기 지출은 알림을 보내지 않는다');

set local role authenticated;

-- ───── A: 토큰 등록·해제 ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*) from public.push_tokens)::int, 0, '남의 푸시 토큰은 안 보인다');
select throws_ok($$insert into public.push_tokens (token, user_id, platform)
  values ('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', '00000000-0000-0000-0000-00000000000a', 'android')$$,
  '42501', null, 'push_tokens 직접 INSERT 거부 — RPC로만');

select lives_ok($$select public.set_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'android')$$,
  'set_push_token으로 내 토큰 등록');
select is((select count(*) from public.push_tokens)::int, 1, '등록한 내 토큰은 보인다');
select throws_ok($$select public.set_push_token('not-a-token', 'android')$$, 'P0001', 'INVALID_INPUT',
  'Expo 토큰 형식이 아니면 거부');
select throws_ok($$select public.set_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'web')$$,
  'P0001', 'INVALID_INPUT', '지원하지 않는 플랫폼 거부');

select lives_ok($$update public.profiles set push_enabled = false where id = '00000000-0000-0000-0000-00000000000a'$$,
  '본인 push_enabled 토글 허용');

select lives_ok($$select public.delete_push_token('ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]')$$,
  'delete_push_token은 남의 토큰에 대해 에러 없이 0행');

-- ───── B: 같은 기기에 다른 계정이 로그인하면 토큰 주인이 바뀐다 ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$select public.set_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios')$$,
  '이미 있는 토큰을 다른 계정이 등록');
select is((select count(*) from public.push_tokens
           where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]' and platform = 'ios')::int, 1,
  '토큰 주인이 새 계정으로 넘어간다');

select finish();
rollback;
