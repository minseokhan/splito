begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ───── fixture ─────
-- A·B: 방 R의 활성 멤버, C: 비멤버. 공개 범위는 save_expense가 판정한다(클라이언트 입력 없음).
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.m(l text) returns uuid language sql as $$
  select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid(l);
$$;
create function pg_temp.e(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid $$;
-- 1박스 지출 저장. p_payer null = 공금. p_photo true면 영수증 1장.
create function pg_temp.exp(l text, p_payer uuid, p_scope uuid[], p_photo boolean default false) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', pg_temp.r(), 'payer_kind', case when p_payer is null then 'pool' else 'member' end,
    'payer_member_id', p_payer, 'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20',
    'currency', 'KRW', 'scope_member_ids', to_jsonb(p_scope),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
      'amount_original', 1000, 'assignee_member_ids', to_jsonb(p_scope))),
    'photos', case when p_photo then jsonb_build_array(jsonb_build_object(
        'storage_path', pg_temp.r() || '/' || v_id || '/' || gen_random_uuid() || '.jpg', 'kind', 'receipt'))
      else '[]'::jsonb end));
  return v_id;
end $$;
-- 대상 인원만 바꿔 다시 저장
create function pg_temp.resave(l text, p_id uuid, p_scope uuid[], p_version int) returns jsonb language plpgsql as $$
begin
  perform pg_temp.as_user(l);
  return public.save_expense(jsonb_build_object(
    'id', p_id, 'room_id', pg_temp.r(), 'payer_kind', 'member', 'payer_member_id', pg_temp.m('a'),
    'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
    'scope_member_ids', to_jsonb(p_scope),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
      'amount_original', 1000))), p_version);
end $$;
create function pg_temp.vis(p_id uuid) returns text language sql as $$
  select visibility from public.expenses where id = p_id;  -- superuser로 호출: RLS 무시
$$;

set local role authenticated;
select pg_temp.as_user('a');
select set_config('t.r', public.create_room('도쿄', 'KRW')::text, true);
select set_config('t.tok', (select invite_token from public.rooms where id = pg_temp.r()), true);
select pg_temp.as_user('b');
select public.join_room(current_setting('t.tok'));

-- ───── 자동 판정 ─────
select set_config('t.e1', pg_temp.exp('a', pg_temp.m('a'), array[pg_temp.m('a')], true)::text, true);
select set_config('t.e2', pg_temp.exp('a', pg_temp.m('a'), array[pg_temp.m('a'), pg_temp.m('b')], true)::text, true);
select set_config('t.e3', pg_temp.exp('a', pg_temp.m('b'), array[pg_temp.m('a')])::text, true);
select set_config('t.e4', pg_temp.exp('b', pg_temp.m('b'), array[pg_temp.m('b')])::text, true);
select pg_temp.as_user('a');
select public.set_pool(pg_temp.r(), true, pg_temp.m('a'), '{}');
select set_config('t.e5', pg_temp.exp('a', null, array[pg_temp.m('a')])::text, true);
select set_config('t.e6', pg_temp.exp('a', pg_temp.m('a'), array[pg_temp.m('a')])::text, true);

reset role;
select is(pg_temp.vis(pg_temp.e('e1')), 'private', '결제자=나·대상=나뿐 → private');
select is(pg_temp.vis(pg_temp.e('e2')), 'shared', '대상에 타인이 있으면 shared');
select is(pg_temp.vis(pg_temp.e('e3')), 'shared', '타인이 내 몫을 대신 결제하면 shared');
select is(pg_temp.vis(pg_temp.e('e4')), 'private', 'B의 단독 지출은 B에게 private');
select is(pg_temp.vis(pg_temp.e('e5')), 'shared', '공금 결제는 대상이 나뿐이어도 shared');

-- 기존 지출(컬럼 추가 전에 들어간 행)은 default로 shared
insert into public.expenses (id, room_id, created_by, payer_kind, payer_member_id, source, paid_local_date,
                             currency, amount_original, krw_amount, fx_source)
values ('30000000-0000-0000-0000-000000000009', pg_temp.r(), pg_temp.uid('a'), 'member',
        (select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid('a')),
        'manual', '2025-10-20', 'KRW', 1000, 1000, 'krw');
select is(pg_temp.vis('30000000-0000-0000-0000-000000000009'), 'shared', '기존 지출은 전부 shared');

-- 영수증 파일(Storage). save_expense는 expense_photos만 쓰므로 객체는 직접 넣는다.
insert into storage.objects (bucket_id, name, owner)
select 'receipts', p.storage_path, pg_temp.uid('a') from public.expense_photos p
where p.expense_id in (pg_temp.e('e1'), pg_temp.e('e2'));

-- ───── 수정으로 공개 범위가 뒤집힌다 ─────
set local role authenticated;
select pg_temp.resave('a', pg_temp.e('e6'), array[pg_temp.m('a'), pg_temp.m('b')], 1);
reset role;
select is(pg_temp.vis(pg_temp.e('e6')), 'shared', '대상에 타인을 넣으면 private → shared');
set local role authenticated;
select pg_temp.resave('a', pg_temp.e('e6'), array[pg_temp.m('a')], 2);
reset role;
select is(pg_temp.vis(pg_temp.e('e6')), 'private', '대상을 나만 남기면 다시 private');
set local role authenticated;

-- ───── 이력 스냅샷 ─────
select is((select array_agg(h -> 'snapshot' ->> 'visibility') from public.expense_history(pg_temp.e('e6')) h),
  '{private,shared,private}'::text[], '이력 스냅샷에 공개 범위가 남는다');

-- ───── RLS: B는 A의 private 지출을 못 본다 ─────
select pg_temp.as_user('b');
select is((select count(*)::int from public.expenses where id = pg_temp.e('e1')), 0, '남의 private expenses 0행');
select is((select count(*)::int from public.expense_items where expense_id = pg_temp.e('e1')), 0,
  '남의 private expense_items 0행');
select is((select count(*)::int from public.expense_scope where expense_id = pg_temp.e('e1')), 0,
  '남의 private expense_scope 0행');
select is((select count(*)::int from public.item_assignees a
           where a.item_id in (select i.id from public.expense_items i where i.expense_id = pg_temp.e('e1'))), 0,
  '남의 private item_assignees 0행');
select is((select count(*)::int from public.expense_photos where expense_id = pg_temp.e('e1')), 0,
  '남의 private expense_photos 0행');
select is((select count(*)::int from public.expense_history where expense_id = pg_temp.e('e1')), 0,
  '남의 private expense_history 0행');
select is((select count(*)::int from storage.objects where name like pg_temp.r() || '/' || pg_temp.e('e1') || '/%'), 0,
  '남의 private 영수증 파일 0행');
select is((select count(*)::int from storage.objects where name like pg_temp.r() || '/' || pg_temp.e('e2') || '/%'), 1,
  'shared 영수증 파일은 보인다');
select throws_ok(format('select * from public.expense_history(%L::uuid)', pg_temp.e('e1')),
  'P0001', 'FORBIDDEN', '남의 private 이력 RPC 거부');
select throws_ok(format($$insert into public.comments (expense_id, room_id, author_id, body)
  values (%L, %L, %L, '끼어들기')$$, pg_temp.e('e1'), pg_temp.r(), pg_temp.uid('b')),
  '42501', null, '남의 private 지출에 댓글 INSERT 거부');
-- 쓰기로 공개 범위를 뒤집어 읽는 우회 차단
select throws_ok(format($$select pg_temp.resave('b', %L::uuid, array[%L::uuid, %L::uuid], 1)$$,
  pg_temp.e('e1'), pg_temp.m('a'), pg_temp.m('b')), 'P0001', 'FORBIDDEN', '남의 private 지출 수정 거부');
select throws_ok(format('select public.delete_expense(%L::uuid, 1)', pg_temp.e('e1')),
  'P0001', 'FORBIDDEN', '남의 private 지출 삭제 거부');
-- shared 지출은 그대로
select is((select count(*)::int from public.expenses where id = pg_temp.e('e2')), 1, 'shared 지출은 보인다');
select is((select count(*)::int from public.expense_items where expense_id = pg_temp.e('e2')), 1,
  'shared 지출의 박스는 보인다');

-- ───── 작성자 본인은 다 본다 ─────
select pg_temp.as_user('a');
select is((select visibility from public.expenses where id = pg_temp.e('e1')), 'private',
  '작성자는 자기 private 지출을 본다');
select is((select count(*)::int from public.expense_items where expense_id = pg_temp.e('e1')), 1,
  '작성자는 자기 private 박스를 본다');
select is((select count(*)::int from public.expense_photos where expense_id = pg_temp.e('e1')), 1,
  '작성자는 자기 private 영수증 행을 본다');
select is((select count(*)::int from storage.objects where name like pg_temp.r() || '/' || pg_temp.e('e1') || '/%'), 1,
  '작성자는 자기 private 영수증 파일을 본다');
select lives_ok(format('select * from public.expense_history(%L::uuid)', pg_temp.e('e1')),
  '작성자는 자기 private 이력을 읽는다');
select lives_ok(format($$insert into public.comments (expense_id, room_id, author_id, body)
  values (%L, %L, %L, '내 메모')$$, pg_temp.e('e1'), pg_temp.r(), pg_temp.uid('a')),
  '작성자는 자기 private 지출에 댓글을 단다');

-- ───── 비멤버 ─────
select pg_temp.as_user('c');
select is((select count(*)::int from public.expenses where room_id = pg_temp.r()), 0,
  '비멤버는 공개 범위와 무관하게 0행');

select * from finish();
rollback;
