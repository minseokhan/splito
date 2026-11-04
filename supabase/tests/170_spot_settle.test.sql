begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- ───── fixture ─────
-- 방 R: a(민지) · b(지훈) · c(서연). 일정 '도톤보리 자유 석식'에 b가 결제한 81,000원 지출을 붙인다.
-- 시안과 같은 구성(함께한 사람 4명 = a + b + QR 2명)으로 만들고 여행 정산이 어떻게 되는지 본다.
insert into auth.users (id, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000000' || l)::uuid, jsonb_build_object('nickname', upper(l))
from unnest('{a,b,c,d}'::text[]) l;

create function pg_temp.uid(l text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000000' || l)::uuid $$;
create function pg_temp.as_user(l text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(l), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.r() returns uuid language sql as $$ select current_setting('t.r')::uuid $$;
create function pg_temp.m(l text) returns uuid language sql as $$
  select id from public.room_members where room_id = pg_temp.r() and user_id = pg_temp.uid(l);
$$;
create function pg_temp.sid() returns uuid language sql as $$ select current_setting('t.s')::uuid $$;
create function pg_temp.spot() returns uuid language sql as $$ select current_setting('t.spot')::uuid $$;
create function pg_temp.tok() returns text language sql as $$ select token from public.spot_settles where id = pg_temp.spot() $$;
create function pg_temp.q(n text) returns uuid language sql as $$ select current_setting('t.q' || n)::uuid $$;
create function pg_temp.net(p_member uuid) returns bigint language sql as $$
  select b.net from public.room_balances(pg_temp.r(), false) b where b.member_id = p_member;
$$;
-- l이 결제한 1박스 KRW 지출. 대상 인원은 그 시점의 활성 참여자 전원 —
-- save_expense는 '내가 결제 + 대상이 나뿐'일 때만 private으로 판정하므로(20261102000000:124),
-- 혼자 담으면 나만 보기가 되어 이 자리 정산 대상에서 빠진다. 이 자리 정산은 이 범위를 좁히는 쪽이다.
create function pg_temp.exp(l text, p_amount numeric, p_sched uuid default null) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform pg_temp.as_user(l);
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', pg_temp.r(), 'payer_kind', 'member', 'payer_member_id', pg_temp.m(l),
    'source', 'manual', 'merchant', '가게', 'paid_local_date', '2025-10-20', 'currency', 'KRW',
    'scope_member_ids', (select jsonb_agg(id) from public.room_members
                         where room_id = pg_temp.r() and left_at is null and kind = 'user'),
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'position', 0,
      'name_original', '품목', 'amount_original', p_amount))));
  if p_sched is not null then perform public.set_expense_meta(v_id, p_sched); end if;
  return v_id;
end $$;

select pg_temp.as_user('a');
select set_config('t.r', public.create_room('오사카·교토 4일', 'KRW', '2025-10-20', '2025-10-23')::text, true);
select pg_temp.as_user('b');
select public.join_room((select invite_token from public.rooms where id = pg_temp.r()));
select public.set_payout_account('090', '토스뱅크', '지훈', '1000-1234-5678');
select pg_temp.as_user('c');
select public.join_room((select invite_token from public.rooms where id = pg_temp.r()));

select pg_temp.as_user('a');
select set_config('t.s', public.save_schedule_item(jsonb_build_object(
  'room_id', pg_temp.r(), 'day_index', 1, 'start_time', '18:30', 'title', '도톤보리 자유 석식'))::text, true);
select set_config('t.s2', public.save_schedule_item(jsonb_build_object(
  'room_id', pg_temp.r(), 'day_index', 1, 'start_time', '09:30', 'title', '인천 → 간사이'))::text, true);

-- ───── 열기 ─────

select pg_temp.as_user('a');
select throws_ok(
  format('select public.open_spot_settle(%L)', current_setting('t.s2')), 'P0001', 'NO_EXPENSE',
  '지출이 없는 일정에서는 열 수 없다');

select set_config('t.e1', pg_temp.exp('b', 81000, pg_temp.sid())::text, true);

select pg_temp.as_user('a');
select set_config('t.spot', (public.open_spot_settle(pg_temp.sid()) ->> 'id'), true);

select matches(pg_temp.tok(), '^[A-Za-z0-9_-]{22}$', '열면 22자 base64url 토큰이 발급된다');
select is((select payer_member_id from public.spot_settles where id = pg_temp.spot()), pg_temp.m('b'),
  '결제자는 이 일정 첫 지출의 결제자다');
select is((select sent_at from public.spot_settles where id = pg_temp.spot()), null, '처음에는 작성 중이다');
select is((select count(*)::int from public.spot_expenses where spot_id = pg_temp.spot()), 1,
  '처음 선택은 지출 1건이다');
select set_eq(
  format('select member_id from public.spot_participants where spot_id = %L', pg_temp.spot()),
  format('values (%L::uuid), (%L::uuid)', pg_temp.m('a'), pg_temp.m('b')),
  '처음 참여자는 나와 결제자다');
select is((public.open_spot_settle(pg_temp.sid()) ->> 'payer_has_account')::boolean, true,
  '결제자 계좌 등록 여부를 같이 내려준다');
select is((public.open_spot_settle(pg_temp.sid()) ->> 'id')::uuid, pg_temp.spot(),
  '다시 열어도 같은 정산이다(멱등)');

select pg_temp.as_user('d');
select throws_ok(format('select public.open_spot_settle(%L)', pg_temp.sid()), 'P0001', 'FORBIDDEN',
  '방 밖 사람은 열 수 없다');

-- ───── RLS·권한: 직접 접근은 막힌다 ─────
set local role authenticated;
select pg_temp.as_user('a');
select is((select count(*)::int from public.spot_settles), 0, 'spot_settles를 직접 읽을 수 없다');
select is((select count(*)::int from public.spot_participants), 0, 'spot_participants를 직접 읽을 수 없다');
select throws_ok(format('select public.spot_join(%L, %L)', pg_temp.tok(), '김하늘'), '42501', null,
  'spot_join은 앱 사용자가 부를 수 없다(Edge Function 전용)');
select throws_ok(format('select public.spot_public_view(%L)', pg_temp.tok()), '42501', null,
  'spot_public_view는 앱 사용자가 부를 수 없다');
reset role;

-- ───── QR 참여 ─────

select set_config('t.q0', (public.spot_join(pg_temp.tok(), '김하늘') ->> 'member_id'), true);
select set_config('t.q1', (public.spot_join(pg_temp.tok(), '박준호') ->> 'member_id'), true);
select is((select guest_name from public.room_members where id = pg_temp.q('1')), '박준호',
  'QR 참여자는 이름을 가진 게스트가 된다');
select is((select representative_member_id from public.room_members where id = pg_temp.q('1')), pg_temp.m('b'),
  'QR 참여자의 대표자는 결제자다 — 결제자가 대신 송금을 확인할 수 있어야 한다');
select is(public.spot_join(pg_temp.tok(), '') ->> 'error', 'INVALID_INPUT', '이름이 비면 못 들어온다');
select is(public.spot_join('없는토큰', '아무개') ->> 'error', 'SPOT_GONE', '없는 토큰은 거절한다');

-- ───── 공개 화면: 계좌는 참여한 사람에게만 ─────

select is(public.spot_public_view(pg_temp.tok()) -> 'account', 'null'::jsonb,
  '참여 전에는 결제자 계좌를 주지 않는다');
select is(public.spot_public_view(pg_temp.tok(), pg_temp.q('1')) #>> '{account,number}', '1000-1234-5678',
  '참여한 사람에게만 계좌 원문을 준다');
select isnt((select account_revealed_at from public.spot_participants
             where spot_id = pg_temp.spot() and member_id = pg_temp.q('1')), null,
  '계좌를 보여준 사실이 남는다');

-- ───── 보내기 ─────

select pg_temp.as_user('a');
select throws_ok(
  format('select public.send_spot_settle(%L, array[%L]::uuid[], array[%L]::uuid[])',
         pg_temp.spot(), current_setting('t.e1'), pg_temp.m('b')),
  'P0001', 'SPOT_TOO_FEW', '혼자서는 보낼 수 없다');

select lives_ok(format(
  'select public.send_spot_settle(%L, array[%L]::uuid[], array[%L,%L,%L,%L]::uuid[])',
  pg_temp.spot(), current_setting('t.e1'),
  pg_temp.m('a'), pg_temp.m('b'), pg_temp.q('0'), pg_temp.q('1')), '보내기가 통과한다');

select isnt((select sent_at from public.spot_settles where id = pg_temp.spot()), null, '보낸 뒤로 바뀐다');
select is((select count(*)::int from public.expense_scope where expense_id = current_setting('t.e1')::uuid), 4,
  '고른 지출의 대상 인원이 고른 사람 4명으로 바뀐다');
select is((select action from public.expense_history where expense_id = current_setting('t.e1')::uuid
           order by at desc limit 1), 'scope_add', '장부 변경이 이력에 남는다');
select is(public._spot_share(pg_temp.spot()), 20250::bigint, '1인 금액은 81,000 / 4 = 20,250원');

-- ───── 받기 전: 받을 돈이므로 장부에 남아 있다 ─────
-- 명세는 "QR 참여자 몫은 여행 정산에 넣지 않는다"고 했지만, 받기 전까지는 실제로 받을 돈이다.
-- 숨기면 조용히 사라지므로 장부에 두고, 결제자가 확인하면 송금으로 닫는다.

select is(pg_temp.net(pg_temp.m('a')), -20250::bigint, '동행 a는 1인분만 진다');
select is(pg_temp.net(pg_temp.m('b')), 60750::bigint, '결제자 b는 아직 세 사람 몫을 받을 돈으로 들고 있다');
select is(pg_temp.net(pg_temp.m('c')), 0::bigint, '이 자리에 없던 c는 영향이 없다');
select is(pg_temp.net(pg_temp.q('1')), -20250::bigint, 'QR 참여자도 자기 순잔액을 갖는다(게스트 분리 정산)');

-- ───── 결제자 혼합 (잔액 단언 뒤에 만든다 — 먼저 만들면 순잔액에 섞인다) ─────

select set_config('t.e2', pg_temp.exp('a', 10920, pg_temp.sid())::text, true);
select pg_temp.as_user('a');
select throws_ok(
  format('select public.send_spot_settle(%L, array[%L,%L]::uuid[], array[%L,%L]::uuid[])',
         pg_temp.spot(), current_setting('t.e1'), current_setting('t.e2'), pg_temp.m('a'), pg_temp.m('b')),
  'P0001', 'SPOT_MIXED_PAYER', '결제자가 다른 지출을 섞을 수 없다');

-- ───── 송금 보고·확인 ─────

select is(public.spot_report(pg_temp.tok(), pg_temp.q('1')) ->> 'ok', 'true',
  'QR 참여자가 송금했다고 알린다');
select isnt((select reported_at from public.spot_participants
             where spot_id = pg_temp.spot() and member_id = pg_temp.q('1')), null, '보고 시각이 남는다');

select pg_temp.as_user('a');
select throws_ok(
  format('select public.confirm_spot_transfer(%L, %L, true)', pg_temp.spot(), pg_temp.q('1')),
  'P0001', 'FORBIDDEN', '받는 사람(결제자)이 아니면 확인할 수 없다');

select pg_temp.as_user('b');
select lives_ok(
  format('select public.confirm_spot_transfer(%L, %L, true)', pg_temp.spot(), pg_temp.q('1')),
  '결제자는 송금을 확인할 수 있다');
select isnt((select transfer_id from public.spot_participants
             where spot_id = pg_temp.spot() and member_id = pg_temp.q('1')), null,
  '확인은 실제 송금 기록으로 남는다');
select is(pg_temp.net(pg_temp.q('1')), 0::bigint, '확인하면 그 사람 순잔액이 0이 된다');
select lives_ok(
  format('select public.confirm_spot_transfer(%L, %L, true)', pg_temp.spot(), pg_temp.q('1')),
  '다시 눌러도 송금이 두 번 기록되지 않는다(멱등)');
select is((select count(*)::int from public.transfers where room_id = pg_temp.r() and voided_at is null), 1,
  '송금 기록은 한 건뿐이다');

select public.confirm_spot_transfer(pg_temp.spot(), pg_temp.q('0'), true);

-- 둘 다 받고 나면 시안의 숫자가 된다: 여행 정산에는 동행끼리의 몫만 남는다.
-- a가 만든 e2(10,920원, 대상 a·b·c)가 섞여 있으므로 그만큼 함께 반영된다.
select is(pg_temp.net(pg_temp.m('b')), 20250::bigint - 3640, '둘 다 받으면 결제자는 동행 몫만 남는다');
select is(pg_temp.net(pg_temp.q('0')), 0::bigint, 'QR 참여자 둘 다 0이 된다');

select lives_ok(
  format('select public.confirm_spot_transfer(%L, %L, false)', pg_temp.spot(), pg_temp.q('1')),
  '확인을 되돌릴 수 있다');
select is(pg_temp.net(pg_temp.q('1')), -20250::bigint, '되돌리면 다시 받을 돈으로 돌아온다');

-- ───── 잠금: 받은 사람은 뺄 수 없다 ─────
select pg_temp.as_user('a');
select throws_ok(format(
  'select public.send_spot_settle(%L, array[%L]::uuid[], array[%L,%L,%L]::uuid[])',
  pg_temp.spot(), current_setting('t.e1'), pg_temp.m('a'), pg_temp.m('b'), pg_temp.q('1')),
  'P0001', 'SPOT_LOCKED', '송금을 확인한 사람은 구성에서 뺄 수 없다');

select * from finish();
rollback;
