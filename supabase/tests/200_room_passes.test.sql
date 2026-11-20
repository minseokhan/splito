begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- ───── fixture: a(방장)·b(멤버)·c(외부인) ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;

select pg_temp.as_user('a');
select set_config('t.r', public.create_room('패스 방', 'KRW')::text, true);
select pg_temp.as_user('b');
select public.join_room((select invite_token from public.rooms where id = current_setting('t.r')::uuid));

insert into public.room_passes (room_id, paid_by_member_id, method)
select current_setting('t.r')::uuid, id, 'toss' from public.room_members
where room_id = current_setting('t.r')::uuid and user_id = pg_temp.uid('a');

-- ───── 제약 ─────
select is((select amount_krw from public.room_passes where room_id = current_setting('t.r')::uuid), 5400::bigint, '금액 기본값은 5,400원');
select is((select split from public.room_passes where room_id = current_setting('t.r')::uuid), false, '1/N 나누기 기본값은 false');
select throws_ok(format($$insert into public.room_passes (room_id, paid_by_member_id) values (%L, (select paid_by_member_id from public.room_passes limit 1))$$, current_setting('t.r')),
  '23505', null, '방마다 패스는 하나');
select throws_ok($$update public.room_passes set method = 'cash'$$, '23514', null, '결제 수단은 toss·kakao·card만');
select is((select relrowsecurity from pg_class where oid = 'public.room_passes'::regclass), true, 'RLS가 켜져 있다');

-- ───── RLS ─────
set local role authenticated;
select pg_temp.as_user('b');
select is((select count(*)::int from public.room_passes where room_id = current_setting('t.r')::uuid), 1, '방 멤버는 패스 기록을 본다');
select throws_ok(format($$insert into public.room_passes (room_id, paid_by_member_id) values (gen_random_uuid(), %L)$$, pg_temp.uid('b')),
  '42501', null, '클라이언트는 직접 INSERT할 수 없다');
select throws_ok($$delete from public.room_passes$$, '42501', null, '클라이언트는 직접 DELETE할 수 없다');

select pg_temp.as_user('c');
select is((select count(*)::int from public.room_passes), 0, '외부인은 0행');

select * from finish();
rollback;
