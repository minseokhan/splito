begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- ───── fixture (superuser) ─────
-- A·B: 방 R1 활성 멤버, C: 비멤버. B가 쓴 댓글 1건.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"nickname":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"nickname":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"nickname":"Carol"}');

insert into public.rooms (id, name, base_currency, owner_id, invite_token) values
  ('10000000-0000-0000-0000-000000000001', 'R1', 'KRW', '00000000-0000-0000-0000-00000000000a', 'tok1');

insert into public.room_members (id, room_id, kind, user_id) values
  ('20000000-0000-0000-0000-00000000001a', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000001b', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000b');

insert into public.expenses (id, room_id, created_by, payer_kind, payer_member_id, source, paid_local_date,
                             currency, amount_original, krw_amount, fx_source) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'member', '20000000-0000-0000-0000-00000000001a', 'manual', '2026-10-21', 'KRW', 10000, 10000, 'krw');

insert into public.comments (id, expense_id, room_id, author_id, body) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000000b', 'B의 댓글');

set local role authenticated;

-- ───── 활성 멤버 A ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.comments set body = '고침', deleted_at = now() where id = '50000000-0000-0000-0000-000000000001';
select is((select body || coalesce(deleted_at::text, '') from public.comments where id = '50000000-0000-0000-0000-000000000001'),
  'B의 댓글', '남의 댓글 UPDATE·소프트 삭제는 0행');
select throws_ok($$insert into public.comments (expense_id, room_id, author_id, body)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', repeat('가', 501))$$,
  '23514', null, '501자 댓글 거부');
select lives_ok($$insert into public.comments (id, expense_id, room_id, author_id, body)
  values ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', repeat('가', 500))$$,
  '500자 댓글 허용(클라이언트 UUID)');
select throws_ok($$delete from public.comments where id = '50000000-0000-0000-0000-000000000002'$$, '42501', null, '댓글 하드 DELETE 거부');
select lives_ok($$update public.comments set deleted_at = now() where id = '50000000-0000-0000-0000-000000000002'$$, '본인 댓글 소프트 삭제');

-- ───── 비멤버 C ─────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok($$insert into public.comments (expense_id, room_id, author_id, body)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '끼어들기')$$,
  '42501', null, '비멤버 댓글 INSERT 거부');
select is((select count(*)::int from public.comments), 0, '비멤버 댓글 0행');

select * from finish();
rollback;
