begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- ───── fixture ─────
-- A: 방 R의 멤버. 카테고리는 클라이언트가 보내고 save_expense가 모르는 값만 접는다.
insert into auth.users (id, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000000a'::uuid, jsonb_build_object('nickname', 'A'));

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.m(l text) returns uuid language sql as $$
  select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid(l);
$$;
-- 1박스 지출 저장. p_category가 '!'면 category 키를 아예 빼고 보낸다.
create function pg_temp.save(p_id uuid, p_category text, p_version int default null) returns jsonb
language plpgsql as $$
declare v_payload jsonb := jsonb_build_object(
  'id', p_id, 'room_id', pg_temp.r(), 'payer_kind', 'member', 'payer_member_id', pg_temp.m('a'),
  'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
  'scope_member_ids', jsonb_build_array(pg_temp.m('a')),
  'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0,
    'name_original', '품목', 'amount_original', 1000)));
begin
  if p_category is distinct from '!' then
    v_payload := v_payload || jsonb_build_object('category', p_category);
  end if;
  return public.save_expense(v_payload, p_version);
end $$;
create function pg_temp.cat(p_id uuid) returns text language sql as $$
  select category from public.expenses where id = p_id;
$$;

set local role authenticated;
select pg_temp.as_user('a');
select set_config('t.r', public.create_room('도쿄', 'KRW')::text, true);

-- ───── 저장·생략·접기 ─────
select set_config('t.v1', (pg_temp.save('40000000-0000-0000-0000-000000000001', 'lodging') ->> 'version'), true);
select is(pg_temp.cat('40000000-0000-0000-0000-000000000001'), 'lodging', '카테고리를 넣으면 그대로 저장된다');

select pg_temp.save('40000000-0000-0000-0000-000000000002', '!');
select is(pg_temp.cat('40000000-0000-0000-0000-000000000002'), null, '카테고리를 빼면 null');

select pg_temp.save('40000000-0000-0000-0000-000000000003', 'cafe');
select is(pg_temp.cat('40000000-0000-0000-0000-000000000003'), 'other', '모르는 값은 other로 접힌다(에러가 아니다)');

-- ───── 수정 ─────
select pg_temp.save('40000000-0000-0000-0000-000000000001', 'transport', current_setting('t.v1')::int);
select is(pg_temp.cat('40000000-0000-0000-0000-000000000001'), 'transport', '재저장으로 카테고리가 바뀐다');

select * from finish();
rollback;
