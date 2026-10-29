begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- ───── fixture (superuser + jwt claims로 RPC 호출) ─────
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c,d,e,f}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
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
-- 사용자 l이 결제, 활성 참여자 전원 대상 1박스
create function pg_temp.exp(p_room uuid, l text, p_amount numeric, p_currency text default 'KRW') returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', p_room, 'payer_kind', 'member', 'payer_member_id', pg_temp.m(p_room, l),
    'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', p_currency,
    'scope_member_ids', (select jsonb_agg(id) from public.room_members where room_id = p_room and left_at is null),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0, 'name_original', '품목',
                                                  'amount_original', p_amount, 'assignee_member_ids', '[]'::jsonb))));
  return v_id;
end $$;
-- 사용자 l의 net (l 권한으로 조회)
create function pg_temp.net(p_room uuid, l text, p_confirmed boolean default false) returns bigint language plpgsql as $$
begin
  perform pg_temp.as_user(l);
  return (select net from public.room_balances(p_room, p_confirmed) where member_id = pg_temp.m(p_room, l));
end $$;
create function pg_temp.tr(p_room uuid, l text, p_id uuid, p_from text, p_to text, p_amount bigint) returns void language plpgsql as $$
begin
  perform pg_temp.as_user(l);
  perform public.record_transfer(p_id, p_room, pg_temp.m(p_room, p_from), pg_temp.m(p_room, p_to), p_amount);
end $$;

-- ───── 권한 ─────
select ok(not has_function_privilege('anon', 'public.record_transfer(uuid,uuid,uuid,uuid,bigint)', 'execute'), 'anon record_transfer 불가');
select ok(not has_function_privilege('anon', 'public.confirm_transfer(uuid)', 'execute'), 'anon confirm_transfer 불가');
select ok(not has_function_privilege('anon', 'public.reject_transfer(uuid)', 'execute'), 'anon reject_transfer 불가');
select ok(not has_function_privilege('anon', 'public.cancel_transfer(uuid)', 'execute'), 'anon cancel_transfer 불가');
select ok(not has_function_privilege('anon', 'public.leave_room(uuid)', 'execute'), 'anon leave_room 불가');
select ok(has_function_privilege('authenticated', 'public.leave_room(uuid)', 'execute'), 'authenticated leave_room 가능');

-- ───── 송금: 방 T(a,b,c), A가 3000 결제 → A +2000, B −1000, C −1000 ─────
select set_config('t.r', pg_temp.room('송금', '{a,b,c}')::text, true);
select pg_temp.exp(current_setting('t.r')::uuid, 'a', 3000);
select set_config('t.t1', gen_random_uuid()::text, true);
select set_config('t.t2', gen_random_uuid()::text, true);
select set_config('t.t3', gen_random_uuid()::text, true);
select set_config('t.t4', gen_random_uuid()::text, true);

-- 보냄 기록 → (false) 반영, (true) 미반영
select pg_temp.tr(current_setting('t.r')::uuid, 'b', current_setting('t.t1')::uuid, 'b', 'a', 1000);
select is(pg_temp.net(current_setting('t.r')::uuid, 'b'), 0::bigint, '보냄 기록: 화면 net 반영');
select is(pg_temp.net(current_setting('t.r')::uuid, 'b', true), -1000::bigint, '보냄 기록: confirmed_only 미반영');
select is((select confirmed_at from public.transfers where id = current_setting('t.t1')::uuid), null, '보낸 사람 기록은 미확인');
select is((select recorded_by from public.transfers where id = current_setting('t.t1')::uuid), pg_temp.uid('b'), 'recorded_by = 호출자');
-- 보낸 사람은 확인 불가, 받는 사람이 확인
select pg_temp.as_user('b');
select throws_ok(format('select public.confirm_transfer(%L)', current_setting('t.t1')), 'P0001', 'FORBIDDEN', '보낸 사람은 확인 불가');
select pg_temp.as_user('a');
select lives_ok(format('select public.confirm_transfer(%L)', current_setting('t.t1')), '받는 사람 확인');
select is(pg_temp.net(current_setting('t.r')::uuid, 'b', true), 0::bigint, '확인 후 confirmed_only 반영');

-- 받는 사람이 기록 → 즉시 확인, 같은 id 두 번 → 1건
select pg_temp.tr(current_setting('t.r')::uuid, 'a', current_setting('t.t2')::uuid, 'c', 'a', 400);
select isnt((select confirmed_at from public.transfers where id = current_setting('t.t2')::uuid), null, '받는 사람 기록은 즉시 확인');
select is(pg_temp.net(current_setting('t.r')::uuid, 'c', true), -600::bigint, '받는 사람 기록: confirmed_only 반영');
select pg_temp.tr(current_setting('t.r')::uuid, 'a', current_setting('t.t2')::uuid, 'c', 'a', 400);
select is((select count(*)::int from public.transfers where id = current_setting('t.t2')::uuid), 1, '같은 id 재호출 → 1건');
select is((select count(*)::int from public.room_events where room_id = current_setting('t.r')::uuid and kind = 'transfer'), 2,
  'room_events transfer는 기록당 1건(재호출은 추가 없음)');

-- 거부 케이스
select pg_temp.as_user('a');
insert into public.room_members (room_id, kind, guest_name, representative_member_id)
  values (current_setting('t.r')::uuid, 'guest', '엄마', pg_temp.m(current_setting('t.r')::uuid, 'a'));
select throws_ok(format('select public.record_transfer(%L, %L, %L, %L, 100)', gen_random_uuid(), current_setting('t.r'),
  (select id from public.room_members where room_id = current_setting('t.r')::uuid and kind = 'guest'),
  pg_temp.m(current_setting('t.r')::uuid, 'a')), 'P0001', 'FORBIDDEN', '게스트 당사자 → FORBIDDEN');
select pg_temp.as_user('c');
select throws_ok(format('select public.record_transfer(%L, %L, %L, %L, 100)', gen_random_uuid(), current_setting('t.r'),
  pg_temp.m(current_setting('t.r')::uuid, 'b'), pg_temp.m(current_setting('t.r')::uuid, 'a')), 'P0001', 'FORBIDDEN', '제3자 기록 → FORBIDDEN');
select throws_ok(format('select public.record_transfer(%L, %L, %L, %L, 0)', gen_random_uuid(), current_setting('t.r'),
  pg_temp.m(current_setting('t.r')::uuid, 'c'), pg_temp.m(current_setting('t.r')::uuid, 'a')), 'P0001', 'AMOUNT_INVALID', '금액 0 → AMOUNT_INVALID');
select throws_ok(format('select public.record_transfer(%L, %L, %L, %L, 100)', gen_random_uuid(), current_setting('t.r'),
  pg_temp.m(current_setting('t.r')::uuid, 'c'), pg_temp.m(current_setting('t.r')::uuid, 'c')), 'P0001', 'INVALID_INPUT', 'from = to → INVALID_INPUT');
select pg_temp.as_user('d');
select throws_ok(format('select public.record_transfer(%L, %L, %L, %L, 100)', gen_random_uuid(), current_setting('t.r'),
  pg_temp.m(current_setting('t.r')::uuid, 'c'), pg_temp.m(current_setting('t.r')::uuid, 'a')), 'P0001', 'FORBIDDEN', '비멤버 → FORBIDDEN');

-- reject: 무효 → net 미반영, 이후 확인 불가
select pg_temp.tr(current_setting('t.r')::uuid, 'b', current_setting('t.t3')::uuid, 'b', 'a', 500);
select pg_temp.as_user('b');
select throws_ok(format('select public.reject_transfer(%L)', current_setting('t.t3')), 'P0001', 'FORBIDDEN', '보낸 사람은 reject 불가');
select pg_temp.as_user('a');
select lives_ok(format('select public.reject_transfer(%L)', current_setting('t.t3')), '받는 사람 reject');
select is((select void_reason || '|' || (voided_by = pg_temp.uid('a')) from public.transfers where id = current_setting('t.t3')::uuid),
  'not_received|true', 'reject → not_received, voided_by');
select is(pg_temp.net(current_setting('t.r')::uuid, 'b'), 0::bigint, 'reject된 송금은 net 미반영');
select pg_temp.as_user('a');
select throws_ok(format('select public.confirm_transfer(%L)', current_setting('t.t3')), 'P0001', 'FORBIDDEN', '무효 송금 확인 → FORBIDDEN');

-- cancel: from 본인만, 확인 전만
select pg_temp.tr(current_setting('t.r')::uuid, 'c', current_setting('t.t4')::uuid, 'c', 'a', 100);
select pg_temp.as_user('a');
select throws_ok(format('select public.cancel_transfer(%L)', current_setting('t.t4')), 'P0001', 'FORBIDDEN', '받는 사람은 cancel 불가');
select pg_temp.as_user('c');
select lives_ok(format('select public.cancel_transfer(%L)', current_setting('t.t4')), '보낸 사람 cancel');
select is((select void_reason from public.transfers where id = current_setting('t.t4')::uuid), 'cancelled', 'cancel → cancelled');
select is(pg_temp.net(current_setting('t.r')::uuid, 'c'), -600::bigint, 'cancel된 송금은 net 미반영');
select pg_temp.as_user('c');
select throws_ok(format('select public.cancel_transfer(%L)', current_setting('t.t2')), 'P0001', 'ALREADY_CONFIRMED', '확인된 송금 cancel → ALREADY_CONFIRMED');
select is((select count(*)::int from public.transfers where room_id = current_setting('t.r')::uuid), 4, '하드 삭제 없음');

-- ───── 정산 후 지출 추가 → 남은 금액만, 역송금 ─────
select set_config('t.s', pg_temp.room('정산후', '{a,b}')::text, true);
select pg_temp.exp(current_setting('t.s')::uuid, 'a', 2000);
select pg_temp.tr(current_setting('t.s')::uuid, 'a', gen_random_uuid(), 'b', 'a', 1000);
select is(pg_temp.net(current_setting('t.s')::uuid, 'b', true), 0::bigint, '정산 완료: B net 0');
select pg_temp.exp(current_setting('t.s')::uuid, 'a', 1000);
select is(pg_temp.net(current_setting('t.s')::uuid, 'b', true), -500::bigint, '정산 후 지출 추가 → 남은 500만');
select pg_temp.exp(current_setting('t.s')::uuid, 'b', 3000);
select is(pg_temp.net(current_setting('t.s')::uuid, 'a', true), -1000::bigint, '역송금: 이제 A가 B에게 1000');

-- ───── leave_room 차단: 방 L(d,e), d 방장 ─────
select set_config('t.l', pg_temp.room('나가기', '{d,e}')::text, true);
insert into public.room_members (room_id, kind, guest_name, representative_member_id)
  values (current_setting('t.l')::uuid, 'guest', '아빠', pg_temp.m(current_setting('t.l')::uuid, 'e'));
select pg_temp.as_user('e');
select throws_ok(format('select public.leave_room(%L)', current_setting('t.l')), 'P0001', 'GUEST_REPRESENTATIVE', '게스트 대표자 → GUEST_REPRESENTATIVE');
update public.room_members set representative_member_id = pg_temp.m(current_setting('t.l')::uuid, 'd')
  where room_id = current_setting('t.l')::uuid and kind = 'guest';
update public.rooms set pool_enabled = true, pool_owner_member_id = pg_temp.m(current_setting('t.l')::uuid, 'e')
  where id = current_setting('t.l')::uuid;
select throws_ok(format('select public.leave_room(%L)', current_setting('t.l')), 'P0001', 'POOL_OWNER', '통장 주인 → POOL_OWNER');
update public.rooms set pool_enabled = false, pool_owner_member_id = null where id = current_setting('t.l')::uuid;
select set_config('t.px', pg_temp.exp(current_setting('t.l')::uuid, 'd', 10, 'USD')::text, true);
select pg_temp.as_user('e');
select throws_ok(format('select public.leave_room(%L)', current_setting('t.l')), 'P0001', 'FX_PENDING_EXISTS', '환율 대기 → FX_PENDING_EXISTS');
select pg_temp.as_user('d');
select public.delete_expense(current_setting('t.px')::uuid, 1);
-- 게스트 포함 대상 3명: 3000 → d·e·게스트 1000씩. 게스트 몫은 대표자 d에게 합산 → e −1000
select pg_temp.exp(current_setting('t.l')::uuid, 'd', 3000);
select set_config('t.lt', gen_random_uuid()::text, true);
select pg_temp.tr(current_setting('t.l')::uuid, 'e', current_setting('t.lt')::uuid, 'e', 'd', 1000);
select pg_temp.as_user('e');
select throws_ok(format('select public.leave_room(%L)', current_setting('t.l')), 'P0001', 'BALANCE_NOT_ZERO', '미확인 송금만 → BALANCE_NOT_ZERO');
select pg_temp.as_user('d');
select public.confirm_transfer(current_setting('t.lt')::uuid);
select pg_temp.as_user('e');
select lives_ok(format('select public.leave_room(%L)', current_setting('t.l')), '확인 후 정상 나가기');
select isnt((select left_at from public.room_members where id = pg_temp.m(current_setting('t.l')::uuid, 'e')), null, 'left_at 기록');
select is((select count(*)::int from public.room_events where room_id = current_setting('t.l')::uuid and kind = 'leave'
  and target_member_id = pg_temp.m(current_setting('t.l')::uuid, 'e')), 1, 'room_events leave 1건');
select is((select owner_id from public.rooms where id = current_setting('t.l')::uuid), pg_temp.uid('d'), '방장 아닌 사람이 나가면 방장 유지');
select pg_temp.as_user('d');
select throws_ok(format('select public.record_transfer(%L, %L, %L, %L, 100)', gen_random_uuid(), current_setting('t.l'),
  pg_temp.m(current_setting('t.l')::uuid, 'e'), pg_temp.m(current_setting('t.l')::uuid, 'd')), 'P0001', 'MEMBER_LEFT', '나간 멤버 송금 → MEMBER_LEFT');
-- 재합류: 같은 참여자 ID
select set_config('t.em', pg_temp.m(current_setting('t.l')::uuid, 'e')::text, true);
select pg_temp.as_user('e');
select is(public.join_room((select invite_token from public.rooms where id = current_setting('t.l')::uuid)), current_setting('t.l')::uuid, '재합류');
select is((select id || '|' || (left_at is null) from public.room_members where room_id = current_setting('t.l')::uuid and user_id = pg_temp.uid('e')),
  current_setting('t.em') || '|true', '재합류: 같은 참여자 ID, left_at 해제');

-- ───── 방장 위임: 방 O(d,e,f), joined_at이 가장 빠른 활성 user에게 ─────
select set_config('t.o', pg_temp.room('위임', '{d,e,f}')::text, true);
update public.room_members set joined_at = now() - interval '1 day' where id = pg_temp.m(current_setting('t.o')::uuid, 'e');
update public.room_members set joined_at = now() - interval '2 day' where id = pg_temp.m(current_setting('t.o')::uuid, 'f');
update public.room_members set joined_at = now() - interval '3 day' where id = pg_temp.m(current_setting('t.o')::uuid, 'd');
select pg_temp.as_user('d');
select lives_ok(format('select public.leave_room(%L)', current_setting('t.o')), '방장 나가기');
select is((select owner_id from public.rooms where id = current_setting('t.o')::uuid), pg_temp.uid('f'), '가장 먼저 합류한 활성 멤버 F에게 위임');
select is((select target_member_id from public.room_events where room_id = current_setting('t.o')::uuid and kind = 'owner_change'),
  pg_temp.m(current_setting('t.o')::uuid, 'f'), 'room_events owner_change');
select is((select deleted_at from public.rooms where id = current_setting('t.o')::uuid), null, '남은 멤버가 있으면 방 유지');

-- ───── 마지막 멤버 → 방 삭제 ─────
select set_config('t.z', pg_temp.room('혼자', '{d}')::text, true);
select pg_temp.as_user('d');
select lives_ok(format('select public.leave_room(%L)', current_setting('t.z')), '마지막 멤버 나가기');
select isnt((select deleted_at from public.rooms where id = current_setting('t.z')::uuid), null, '마지막 멤버가 나가면 방 삭제');
select throws_ok(format('select public.leave_room(%L)', current_setting('t.z')), 'P0001', 'FORBIDDEN', '이미 나간 방 → FORBIDDEN');

select * from finish();
rollback;
