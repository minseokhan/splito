begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- ───── fixture (superuser) ─────
-- A·B: 방 R1 활성 멤버, D: R1에서 나감, C: 비멤버(R3 소유). R2: A가 멤버인 삭제된 방.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"nickname":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"full_name":"Carol Christmas Long"}'),
  ('00000000-0000-0000-0000-00000000000d', '{}');

insert into public.rooms (id, name, base_currency, owner_id, invite_token, deleted_at) values
  ('10000000-0000-0000-0000-000000000001', 'R1', 'JPY', '00000000-0000-0000-0000-00000000000a', 'tok1', null),
  ('10000000-0000-0000-0000-000000000002', 'R2', 'KRW', '00000000-0000-0000-0000-00000000000a', 'tok2', now()),
  ('10000000-0000-0000-0000-000000000003', 'R3', 'KRW', '00000000-0000-0000-0000-00000000000c', 'tok3', null);

insert into public.room_members (id, room_id, kind, user_id, left_at) values
  ('20000000-0000-0000-0000-00000000001a', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000a', null),
  ('20000000-0000-0000-0000-00000000001b', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000b', null),
  ('20000000-0000-0000-0000-00000000001d', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000d', now()),
  ('20000000-0000-0000-0000-00000000002a', '10000000-0000-0000-0000-000000000002', 'user', '00000000-0000-0000-0000-00000000000a', null),
  ('20000000-0000-0000-0000-00000000003c', '10000000-0000-0000-0000-000000000003', 'user', '00000000-0000-0000-0000-00000000000c', null);

insert into public.expenses (id, room_id, created_by, payer_kind, payer_member_id, source, paid_local_date,
                             currency, amount_original, krw_amount, fx_source, deleted_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'member', '20000000-0000-0000-0000-00000000001a', 'manual', '2026-10-21', 'KRW', 10000, 10000, 'krw', null),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'member', '20000000-0000-0000-0000-00000000001a', 'manual', '2026-10-21', 'KRW', 5000, 5000, 'krw', now());

insert into public.transfers (id, room_id, from_member_id, to_member_id, amount_krw) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-00000000001b', '20000000-0000-0000-0000-00000000001a', 1000);

-- ───── 스키마 기본 ─────
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, '모든 public 테이블 RLS 활성');
select is((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'Alice', 'handle_new_user: nickname');
select is((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'Bob', 'handle_new_user: name 대체');
select is((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 'Carol Christ', 'handle_new_user: 12자 절단');
select is((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000d'), '', 'handle_new_user: 없으면 빈 문자열');
select columns_are('public', 'member_profiles', array['id', 'nickname', 'avatar_url'], 'member_profiles는 공개 컬럼만');

-- ───── 제약 위반 ─────
select throws_ok($$insert into public.expenses (room_id, created_by, payer_kind, payer_member_id, source, paid_local_date, currency, amount_original, krw_amount, fx_source)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'member', '20000000-0000-0000-0000-00000000001a', 'manual', '2026-10-21', 'KRW', 0, 0, 'krw')$$,
  '23514', null, 'amount_original <= 0 거부');
select throws_ok($$insert into public.expenses (room_id, created_by, payer_kind, payer_member_id, source, paid_local_date, currency, amount_original, krw_amount, fx_source)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'member', '20000000-0000-0000-0000-00000000001a', 'manual', '2026-10-21', 'KRW', 100, 100, 'kexim')$$,
  '23514', null, 'KRW인데 fx_source≠krw 거부');
select throws_ok($$insert into public.expenses (room_id, created_by, payer_kind, payer_member_id, source, paid_local_date, currency, amount_original, krw_amount, fx_source)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'member', '20000000-0000-0000-0000-00000000001a', 'manual', '2026-10-21', 'JPY', 100, 900, 'pending')$$,
  '23514', null, 'pending인데 krw_amount 있음 거부');
select throws_ok($$insert into public.expense_scope (expense_id, member_id, room_id)
  values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000003c', '10000000-0000-0000-0000-000000000001')$$,
  '23503', null, '다른 방 member_id를 expense_scope에 넣기 거부');
select throws_ok($$insert into public.room_members (room_id, kind, user_id, guest_name)
  values ('10000000-0000-0000-0000-000000000001', 'guest', null, '엄마')$$,
  '23514', null, '대표자 없는 게스트 거부');

-- ───── 비멤버 C ─────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.rooms where id = '10000000-0000-0000-0000-000000000001'), 0, '비멤버 rooms 0행');
select is((select count(*)::int from public.expenses where room_id = '10000000-0000-0000-0000-000000000001'), 0, '비멤버 expenses 0행');
select is((select count(*)::int from public.member_profiles where id = '00000000-0000-0000-0000-00000000000a'), 0, '비멤버는 member_profiles로도 안 보임');

-- ───── 활성 멤버 A ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.rooms where id = '10000000-0000-0000-0000-000000000001'), 1, '멤버 rooms 조회');
select is((select count(*)::int from public.expenses where room_id = '10000000-0000-0000-0000-000000000001'), 1, '멤버 expenses 조회(소프트 삭제 제외)');
select is((select count(*)::int from public.rooms where id = '10000000-0000-0000-0000-000000000002'), 0, '삭제된 방 0행');

select throws_ok($$insert into public.expenses (room_id, created_by, payer_kind, payer_member_id, source, paid_local_date, currency, amount_original, krw_amount, fx_source)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'member', '20000000-0000-0000-0000-00000000001a', 'manual', '2026-10-21', 'KRW', 100, 100, 'krw')$$,
  '42501', null, '멤버 expenses 직접 INSERT 거부');
select throws_ok($$update public.expenses set krw_amount = 1 where room_id = '10000000-0000-0000-0000-000000000001'$$, '42501', null, '멤버 expenses 직접 UPDATE 거부');
select throws_ok($$delete from public.expenses where room_id = '10000000-0000-0000-0000-000000000001'$$, '42501', null, '멤버 expenses 직접 DELETE 거부');
select throws_ok($$insert into public.transfers (room_id, from_member_id, to_member_id, amount_krw)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000001a', '20000000-0000-0000-0000-00000000001b', 1)$$,
  '42501', null, '멤버 transfers 직접 INSERT 거부');
select throws_ok($$update public.transfers set confirmed_at = now()$$, '42501', null, '멤버 transfers 직접 UPDATE 거부');
select throws_ok($$delete from public.transfers$$, '42501', null, '멤버 transfers 직접 DELETE 거부');
select throws_ok($$insert into public.room_members (room_id, kind, user_id)
  values ('10000000-0000-0000-0000-000000000003', 'user', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, '멤버 room_members 직접 INSERT 거부');
select throws_ok($$update public.room_members set left_at = null$$, '42501', null, '멤버 room_members 직접 UPDATE 거부');
select throws_ok($$delete from public.room_members$$, '42501', null, '멤버 room_members 직접 DELETE 거부');

select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 0, 'profiles 타인 행 0행');
select is((select nickname from public.member_profiles where id = '00000000-0000-0000-0000-00000000000b'), 'Bob', 'member_profiles로 같은 방 nickname 조회');
select lives_ok($$update public.profiles set nickname = '앨리스' where id = '00000000-0000-0000-0000-00000000000a'$$, '본인 nickname 수정 가능');
select throws_ok($$update public.profiles set deleted_at = now() where id = '00000000-0000-0000-0000-00000000000a'$$, '42501', null, '허용 외 profiles 컬럼 수정 거부');

select lives_ok($$insert into public.comments (expense_id, room_id, author_id, body)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '이건 뭐야?')$$,
  '본인 명의 댓글 INSERT');
select throws_ok($$insert into public.comments (expense_id, room_id, author_id, body)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '사칭')$$,
  '42501', null, '타인 명의 댓글 INSERT 거부');

-- ───── 나간 멤버 D ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select is((select count(*)::int from public.rooms where id = '10000000-0000-0000-0000-000000000001'), 0, '나간 멤버 rooms 0행');
select is((select count(*)::int from public.expenses where room_id = '10000000-0000-0000-0000-000000000001'), 0, '나간 멤버 expenses 0행');

select * from finish();
rollback;
