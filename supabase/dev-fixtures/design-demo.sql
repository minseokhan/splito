-- 디자인 확인용 예시 데이터 (splito-dev 전용, 마이그레이션 아님). 운영 DB에서 실행하지 말 것.
-- 재실행 가능: 맨 앞 정리 구간이 이름이 '[예시] '로 시작하는 방과 그 하위 데이터만 지우고 다시 만든다.
-- 장부 쓰기는 기존 RPC(create_room·join_room·save_expense·record_transfer …)로 한다. 원화 확정·박스 배분은 서버 몫.
-- 사용자 흉내: request.jwt.claims의 sub만 바꾼다(RPC가 security definer라 auth.uid()만 의미가 있다).
-- 사람: 한민석(profiles.nickname) · 지훈·서연(dev 테스트 계정, src/services/auth.ts TEST_USERS).
-- 주의: expenses·transfers 트리거가 push를 보낸다. 실행 시점에 push_tokens가 비어 있었다(알림 없음).
-- 실행: Supabase MCP execute_sql(project=splito-dev)에 파일 전체를 넣거나, psql "$DEV_DB_URL" -f 이 파일.

begin;

-- ───────────── 정리: '[예시] ' 방만 ─────────────
create temp table demo_rooms on commit drop as select id from public.rooms where name like '[예시] %';

delete from public.spot_settles where room_id in (select id from demo_rooms);  -- spot_participants·spot_expenses cascade
delete from public.comments where room_id in (select id from demo_rooms);
delete from public.expense_history where room_id in (select id from demo_rooms);
delete from public.expenses where room_id in (select id from demo_rooms);      -- items·scope·photos·assignees cascade
delete from public.transfers where room_id in (select id from demo_rooms);
delete from public.pool_deposits where room_id in (select id from demo_rooms);
delete from public.room_events where room_id in (select id from demo_rooms);
delete from public.payout_reveals where room_id in (select id from demo_rooms);
delete from public.room_fx_overrides where room_id in (select id from demo_rooms);
delete from public.schedule_items where room_id in (select id from demo_rooms); -- schedule_hides cascade
delete from public.trip_bookings where room_id in (select id from demo_rooms);
delete from public.trip_budgets where room_id in (select id from demo_rooms);
delete from public.room_passes where room_id in (select id from demo_rooms);
update public.rooms set pool_owner_member_id = null where id in (select id from demo_rooms);
delete from public.room_members where room_id in (select id from demo_rooms) and kind = 'guest';
delete from public.room_members where room_id in (select id from demo_rooms);
delete from public.rooms where id in (select id from demo_rooms);

-- ───────────── 도우미 (세션 임시 함수) ─────────────
create or replace function pg_temp.act(p uuid) returns text language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.mid(p_room uuid, p_user uuid) returns uuid language sql as $$
  select id from public.room_members where room_id = p_room and user_id = p_user;
$$;

-- items: [{name, ko?, qty?, amt, nr?, who?: [member_id…]}]. p_payer null = 공금 결제.
create or replace function pg_temp.exp(p_room uuid, p_payer uuid, p_scope uuid[], p_date date, p_time text, p_cur text,
                            p_source text, p_merchant text, p_cat text, p_items jsonb,
                            p_extra jsonb default '{}') returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.save_expense(jsonb_build_object(
    'id', v_id, 'room_id', p_room,
    'payer_kind', case when p_payer is null then 'pool' else 'member' end,
    'payer_member_id', p_payer, 'source', p_source, 'merchant', p_merchant,
    'paid_local_date', p_date, 'paid_local_time', p_time, 'currency', p_cur, 'category', p_cat,
    'scope_member_ids', to_jsonb(p_scope),
    'items', (select jsonb_agg(jsonb_build_object(
                'id', gen_random_uuid(), 'position', o - 1, 'name_original', x ->> 'name', 'name_ko', x ->> 'ko',
                'quantity', coalesce((x ->> 'qty')::numeric, 1), 'amount_original', (x ->> 'amt')::numeric,
                'needs_review', coalesce((x ->> 'nr')::boolean, false),
                'assignee_member_ids', coalesce(x -> 'who', '[]')) order by o)
              from jsonb_array_elements(p_items) with ordinality t(x, o))
  ) || p_extra, null);
  return v_id;
end $$;

create or replace function pg_temp.sched(p_room uuid, p_day int, p_time text, p_title text, p_est bigint default 0) returns uuid
language sql as $$
  select public.save_schedule_item(jsonb_build_object('room_id', p_room, 'day_index', p_day,
    'start_time', p_time, 'title', p_title, 'est_amount', p_est));
$$;

do $$
declare
  u_h uuid := (select id from public.profiles where nickname = '한민석' and deleted_at is null order by created_at limit 1);
  u_j uuid := (select id from auth.users where email = 'mock-jihoon@splito.invalid');
  u_s uuid := (select id from auth.users where email = 'mock-seoyeon@splito.invalid');
  r uuid; h uuid; j uuid; s uuid; e uuid;
  sc0 uuid; sc1 uuid; sc2 uuid; sc3 uuid; sc4 uuid; sc5 uuid;
  n_j bigint; n_s bigint;
begin
  if u_h is null or u_j is null or u_s is null then
    raise exception 'demo users missing: 한민석=% 지훈=% 서연=%', u_h, u_j, u_s;
  end if;

  -- ═════════════ 1. 자유여행: 오사카·교토 (JPY, 3박 4일, 진행 중) ═════════════
  perform pg_temp.act(u_h);
  r := public.create_room('[예시] 오사카·교토', 'JPY', '2026-11-17', '2026-11-20');
  perform pg_temp.act(u_j); perform public.join_room((select invite_token from public.rooms where id = r));
  perform pg_temp.act(u_s); perform public.join_room((select invite_token from public.rooms where id = r));
  h := pg_temp.mid(r, u_h); j := pg_temp.mid(r, u_j); s := pg_temp.mid(r, u_s);

  -- 일정표: 시간 있는 것 / 없는 것
  perform pg_temp.act(u_h);
  perform pg_temp.sched(r, 0, '14:30', '간사이공항 도착');
  sc0 := pg_temp.sched(r, 0, '16:00', '도톤보리 호텔 체크인');
  perform pg_temp.sched(r, 0, null, '도톤보리 산책');
  sc1 := pg_temp.sched(r, 0, '19:00', '이치란 라멘', 30000);
  sc2 := pg_temp.sched(r, 1, '08:30', '유니버설 스튜디오 재팬', 250000);
  sc3 := pg_temp.sched(r, 1, null, '이자카야 저녁');
  perform pg_temp.sched(r, 2, '09:00', '교토 이동 (JR)');
  sc4 := pg_temp.sched(r, 2, '11:00', '기요미즈데라');
  sc5 := pg_temp.sched(r, 2, null, '돈키호테 쇼핑');
  perform pg_temp.sched(r, 3, null, '체크아웃');
  perform pg_temp.sched(r, 3, '15:20', '간사이공항 출발');

  -- 공금 지갑: 통장 주인 한민석, 1인 3만원
  perform public.set_pool(r, true, h, array['7713']);
  perform public.upsert_pool_deposits(r, jsonb_build_array(
    jsonb_build_object('member_id', h, 'amount_krw', 30000),
    jsonb_build_object('member_id', j, 'amount_krw', 30000),
    jsonb_build_object('member_id', s, 'amount_krw', 30000)));

  -- 예산: 한민석은 카테고리 직접 배분, 지훈은 총액만
  perform public.save_trip_budget(r, 1500000, 'manual', jsonb_build_object(
    'food', 400000, 'transport', 200000, 'shopping', 300000, 'sightseeing', 250000, 'lodging', 350000));
  perform pg_temp.act(u_j);
  perform public.save_trip_budget(r, 1000000, 'none', '{}');

  -- 여행 패스 (쓰기 RPC 없음: 개발 데이터는 SQL로 넣는다 — room_passes 마이그레이션 주석)
  insert into public.room_passes (room_id, paid_by_member_id, method) values (r, h, 'kakao');

  -- 지출 (day 0)
  perform pg_temp.act(u_h);
  perform pg_temp.exp(r, h, array[h, j, s], '2026-11-17', '15:10', 'JPY', 'manual', '난카이 라피트', 'transport',
    jsonb_build_array(jsonb_build_object('name', 'ラピート 大人', 'ko', '라피트 성인', 'qty', 3, 'amt', 4470)));
  e := pg_temp.exp(r, h, array[h, j, s], '2026-11-17', '16:05', 'JPY', 'card_text', '도톤보리 호텔', 'lodging',
    jsonb_build_array(jsonb_build_object('name', '3泊 ツイン+エキストラベッド', 'ko', '3박 객실', 'amt', 96000)),
    jsonb_build_object('krw_charged', 812400, 'card_last4', '4821'));
  perform public.set_expense_meta(e, sc0, null);

  perform pg_temp.act(u_j);
  e := pg_temp.exp(r, j, array[h, j, s], '2026-11-17', '19:40', 'JPY', 'receipt', '一蘭 道頓堀店', 'food',
    jsonb_build_array(
      jsonb_build_object('name', '天然とんこつラーメン', 'ko', '돈코츠 라멘', 'qty', 3, 'amt', 2940),
      jsonb_build_object('name', '半熟塩ゆで玉子', 'ko', '반숙 달걀', 'qty', 2, 'amt', 380, 'who', jsonb_build_array(h, j)),
      jsonb_build_object('name', '生ビール', 'ko', '생맥주', 'amt', 680, 'who', jsonb_build_array(j))));
  perform public.set_expense_meta(e, sc1, null);

  -- day 1
  perform pg_temp.act(u_h);
  e := pg_temp.exp(r, h, array[h, j, s], '2026-11-18', '08:20', 'JPY', 'manual', '유니버설 스튜디오 재팬', 'sightseeing',
    jsonb_build_array(jsonb_build_object('name', '1デイ・スタジオ・パス', 'ko', '1일권', 'qty', 3, 'amt', 29400)));
  perform public.set_expense_meta(e, sc2, null);

  perform pg_temp.act(u_s);
  perform pg_temp.exp(r, s, array[h, j, s], '2026-11-18', '12:30', 'JPY', 'voice', '파크 안 버거집', 'food',
    jsonb_build_array(jsonb_build_object('name', '버거 세트 3개', 'amt', 3600)));

  -- 확인필요: 영수증 품목 하나를 못 읽음 + 품목마다 먹은 사람 지정
  perform pg_temp.act(u_j);
  e := pg_temp.exp(r, j, array[h, j, s], '2026-11-18', '20:15', 'JPY', 'receipt', '居酒屋 まる', 'food',
    jsonb_build_array(
      jsonb_build_object('name', '生ビール', 'ko', '생맥주', 'qty', 4, 'amt', 2400, 'who', jsonb_build_array(h, j)),
      jsonb_build_object('name', '日本酒 獺祭', 'ko', '사케 닷사이', 'amt', 1800, 'who', jsonb_build_array(h, j)),
      jsonb_build_object('name', 'オレンジジュース', 'ko', '오렌지 주스', 'amt', 450, 'who', jsonb_build_array(s)),
      jsonb_build_object('name', '唐揚げ', 'ko', '가라아게', 'amt', 780),
      jsonb_build_object('name', '焼き鳥 盛', 'ko', '꼬치 모둠', 'amt', 1350),
      jsonb_build_object('name', '??? (판독 불가)', 'amt', 600, 'nr', true)),
    jsonb_build_object('needs_review', true));
  perform public.set_expense_meta(e, sc3, null);
  insert into public.comments (expense_id, room_id, author_id, body) values (e, r, u_s, '저 사케는 안 마셨어요! 주스만 🙏');

  -- day 2 (교토)
  perform pg_temp.act(u_h);
  perform pg_temp.exp(r, null, array[h, j, s], '2026-11-19', '09:05', 'JPY', 'card_text', 'JR 오사카역', 'transport',
    jsonb_build_array(jsonb_build_object('name', '新快速 京都 往復', 'ko', '교토 왕복', 'qty', 3, 'amt', 6840)),
    jsonb_build_object('card_last4', '7713'));
  perform pg_temp.act(u_s);
  e := pg_temp.exp(r, s, array[h, j, s], '2026-11-19', '11:10', 'JPY', 'manual', '기요미즈데라', 'sightseeing',
    jsonb_build_array(jsonb_build_object('name', '拝観料', 'ko', '입장료', 'qty', 3, 'amt', 1200)));
  perform public.set_expense_meta(e, sc4, null);
  perform pg_temp.act(u_h);
  e := pg_temp.exp(r, h, array[h, s], '2026-11-19', '18:40', 'JPY', 'card_text', 'ドン・キホーテ 道頓堀', 'shopping',
    jsonb_build_array(
      jsonb_build_object('name', '化粧品', 'ko', '화장품', 'amt', 5280, 'who', jsonb_build_array(s)),
      jsonb_build_object('name', 'お菓子', 'ko', '과자', 'amt', 3360)),
    jsonb_build_object('krw_charged', 74210, 'card_last4', '4821'));
  perform public.set_expense_meta(e, sc5, null);
  -- 나만 보기 지출 (결제자=대상=나 → private)
  perform pg_temp.exp(r, h, array[h], '2026-11-19', '19:30', 'JPY', 'manual', '기념품 가게', 'shopping',
    jsonb_build_array(jsonb_build_object('name', '키링', 'amt', 2200)));

  -- day 3 (오늘): 카드 캡처 금액 확인필요 + 원화 지출
  perform pg_temp.act(u_s);
  perform pg_temp.exp(r, s, array[h, j, s], '2026-11-20', '08:10', 'JPY', 'card_image', '로손 난바점', 'food',
    jsonb_build_array(jsonb_build_object('name', '아침 편의점', 'amt', 1860, 'nr', true)),
    jsonb_build_object('needs_review', true));
  perform pg_temp.act(u_h);
  perform pg_temp.exp(r, h, array[h, j, s], '2026-11-20', '06:00', 'KRW', 'manual', '인천공항 장기주차', 'transport',
    jsonb_build_array(jsonb_build_object('name', '주차 4일', 'amt', 45000)));

  -- 정산 송금 상태 섞기: 서연→민석 일부 받았어요 / 지훈→민석 확인 대기 / 서연 나머지는 송금 필요
  select b.net into n_j from public.room_balances(r, false) b where b.member_id = j;
  select b.net into n_s from public.room_balances(r, false) b where b.member_id = s;
  if n_j >= 0 or n_s > -30000 then raise exception 'unexpected osaka balances j=% s=%', n_j, n_s; end if;
  perform public.record_transfer(gen_random_uuid(), r, s, h, 20000);   -- 받는 사람이 기록 → 바로 확인
  perform pg_temp.act(u_j);
  perform public.record_transfer(gen_random_uuid(), r, j, h, -n_j);    -- 보낸 사람이 기록 → 확인 대기

  -- ═════════════ 2. 패키지: 방콕·파타야 (THB, 예약 연동 + 선결제, 다가오는 여행) ═════════════
  perform pg_temp.act(u_h);
  r := public.create_room('[예시] 방콕·파타야 패키지', 'THB', '2026-12-10', '2026-12-14');
  perform pg_temp.act(u_j); perform public.join_room((select invite_token from public.rooms where id = r));
  h := pg_temp.mid(r, u_h); j := pg_temp.mid(r, u_j);

  perform pg_temp.act(u_h);
  perform public.link_booking(r, jsonb_build_object(
    'provider', 'hanatour', 'booking_no', 'DEMO-BKK-0001', 'holder_masked', '한*석',
    'product_name', '방콕·파타야 5일 노쇼핑 특가', 'destination', '방콕', 'start_date', '2026-12-10',
    'end_date', '2026-12-14', 'pax', 2, 'paid_amount', 1798000, 'paid_at', '2026-11-05',
    'schedule', jsonb_build_array(
      jsonb_build_object('day_index', 0, 'start_time', '09:20', 'title', '인천 출발 (TG659)', 'includes', jsonb_build_array('항공')),
      jsonb_build_object('day_index', 0, 'start_time', '13:30', 'title', '방콕 도착 · 호텔 체크인', 'includes', jsonb_build_array('호텔', '가이드')),
      jsonb_build_object('day_index', 1, 'start_time', '09:00', 'title', '왕궁 · 왓포 관광', 'includes', jsonb_build_array('입장료', '중식'), 'excludes', jsonb_build_array('가이드 팁')),
      jsonb_build_object('day_index', 1, 'start_time', '19:00', 'title', '짜오프라야 디너 크루즈', 'optional', true, 'est_amount', 70000),
      jsonb_build_object('day_index', 2, 'title', '파타야 이동 · 산호섬', 'includes', jsonb_build_array('전용 차량')),
      jsonb_build_object('day_index', 2, 'start_time', '20:00', 'title', '알카자 쇼', 'optional', true, 'est_amount', 45000),
      jsonb_build_object('day_index', 3, 'title', '자유 일정'),
      jsonb_build_object('day_index', 4, 'start_time', '23:40', 'title', '방콕 출발 (TG656)', 'includes', jsonb_build_array('항공')))));

  -- 선결제: 앱 prepay 화면과 같은 방식(KRW 지출 + auto_prepay·budget_excluded 태그)
  e := pg_temp.exp(r, h, array[h, j], '2026-11-05', null, 'KRW', 'manual', '패키지 상품 결제', 'other',
    jsonb_build_array(jsonb_build_object('name', '패키지 상품 결제', 'amt', 1798000)));
  perform public.set_expense_meta(e, null, array['auto_prepay', 'budget_excluded']);
  perform pg_temp.act(u_j);
  perform pg_temp.exp(r, j, array[h, j], '2026-11-12', '21:00', 'KRW', 'manual', '여행자 보험', 'other',
    jsonb_build_array(jsonb_build_object('name', '해외여행자보험 2인', 'amt', 38400)));
  perform public.save_trip_budget(r, 800000, 'manual', jsonb_build_object('food', 300000, 'shopping', 300000, 'sightseeing', 200000));

  -- ═════════════ 3. 지난 여행: 제주 (KRW, 정산 완료) ═════════════
  perform pg_temp.act(u_h);
  r := public.create_room('[예시] 제주 2박 3일', 'KRW', '2026-09-12', '2026-09-14');
  perform pg_temp.act(u_j); perform public.join_room((select invite_token from public.rooms where id = r));
  perform pg_temp.act(u_s); perform public.join_room((select invite_token from public.rooms where id = r));
  h := pg_temp.mid(r, u_h); j := pg_temp.mid(r, u_j); s := pg_temp.mid(r, u_s);

  perform pg_temp.act(u_h);
  perform pg_temp.exp(r, h, array[h, j, s], '2026-09-12', '15:00', 'KRW', 'manual', '애월 독채 펜션', 'lodging',
    jsonb_build_array(jsonb_build_object('name', '2박', 'amt', 360000)));
  perform pg_temp.act(u_j);
  perform pg_temp.exp(r, j, array[h, j, s], '2026-09-12', '11:00', 'KRW', 'card_text', '제주 렌터카', 'transport',
    jsonb_build_array(jsonb_build_object('name', '렌터카 3일', 'amt', 150000)), jsonb_build_object('card_last4', '1180'));
  perform pg_temp.act(u_s);
  perform pg_temp.exp(r, s, array[h, j, s], '2026-09-13', '19:30', 'KRW', 'receipt', '흑돼지 거리', 'food',
    jsonb_build_array(jsonb_build_object('name', '흑돼지 오겹 3인', 'amt', 75000),
                      jsonb_build_object('name', '한라산 소주', 'qty', 3, 'amt', 15000)));
  -- 민석 +160,000 / 지훈 −50,000 / 서연 −110,000 → 받는 사람(민석)이 기록해 바로 확인 → settled
  perform pg_temp.act(u_h);
  perform public.record_transfer(gen_random_uuid(), r, j, h, 50000);
  perform public.record_transfer(gen_random_uuid(), r, s, h, 110000);
end $$;

commit;
