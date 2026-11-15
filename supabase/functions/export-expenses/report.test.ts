import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { buildReport, type ReportInput } from './report.ts';

const M = { minji: 'm-minji', jihun: 'm-jihun', seoyeon: 'm-seoyeon', mom: 'm-mom', gone: 'm-gone' };
const U = { minji: 'u-minji', jihun: 'u-jihun', seoyeon: 'u-seoyeon', gone: 'u-gone' };

function exp(over: Partial<ReportInput['expenses'][number]>): ReportInput['expenses'][number] {
  return {
    id: 'e',
    payer_kind: 'member',
    payer_member_id: M.minji,
    source: 'receipt',
    flags: [],
    merchant: '가게',
    paid_local_date: '2026-10-20',
    paid_local_time: '12:40:00',
    currency: 'JPY',
    amount_original: 1000,
    krw_amount: 9100,
    fx_rate: 9.1,
    fx_source: 'kexim',
    visibility: 'shared',
    category: 'food',
    schedule_id: null,
    created_by: U.minji,
    created_at: '2026-10-20T03:40:00Z',
    itemized: false,
    ...over,
  };
}

const base: ReportInput = {
  now: new Date('2026-11-10T05:32:00Z'), // KST 14:32
  me: { userId: U.minji, memberId: M.minji },
  room: {
    name: '오사카·교토',
    base_currency: 'JPY',
    start_date: '2026-10-20',
    end_date: '2026-10-23',
    owner_id: U.minji,
  },
  members: [
    { id: M.minji, kind: 'user', userId: U.minji, name: '민지', leftAt: null, spotOnly: false },
    { id: M.jihun, kind: 'user', userId: U.jihun, name: '지훈', leftAt: null, spotOnly: false },
    { id: M.seoyeon, kind: 'user', userId: U.seoyeon, name: '서연', leftAt: null, spotOnly: false },
    { id: M.mom, kind: 'guest', userId: null, name: '엄마', leftAt: null, spotOnly: false },
  ],
  expenses: [
    exp({
      id: 'pre', merchant: '하나투어 패키지 상품 결제', paid_local_date: '2026-10-19', paid_local_time: '21:14:00',
      currency: 'KRW', amount_original: 40000, krw_amount: 40000, fx_rate: null, fx_source: 'krw', category: 'lodging',
      flags: ['auto_prepay'], source: 'manual',
    }),
    exp({ id: 'ramen', merchant: '이치란 라멘', itemized: true, schedule_id: 's1', paid_local_time: '12:40:00' }),
    exp({ id: 'train', merchant: '라피트', paid_local_time: '09:10:00', payer_member_id: M.jihun, created_by: U.jihun, category: 'transport' }),
    exp({ id: 'snack', merchant: '편의점', visibility: 'private', paid_local_date: '2026-10-21', paid_local_time: null, krw_amount: 3000 }),
    exp({ id: 'wait', merchant: '환율 대기', paid_local_date: '2026-10-21', krw_amount: null, fx_rate: null, fx_source: 'pending' }),
  ],
  scope: [
    ...[M.minji, M.jihun, M.seoyeon, M.mom].map((m) => ({ expense_id: 'pre', member_id: m })),
    ...[M.minji, M.jihun, M.seoyeon].map((m) => ({ expense_id: 'ramen', member_id: m })),
    ...[M.minji, M.jihun, M.seoyeon, M.mom].map((m) => ({ expense_id: 'train', member_id: m })),
    { expense_id: 'snack', member_id: M.minji },
  ],
  shares: [
    ...[M.minji, M.jihun, M.seoyeon, M.mom].map((m) => ({ expense_id: 'pre', member_id: m, share: 10000 })),
    { expense_id: 'ramen', member_id: M.minji, share: 2000 },
    { expense_id: 'ramen', member_id: M.jihun, share: 3550 },
    { expense_id: 'ramen', member_id: M.seoyeon, share: 3550 },
    ...[M.minji, M.jihun, M.seoyeon, M.mom].map((m) => ({ expense_id: 'train', member_id: m, share: 2275 })),
    { expense_id: 'snack', member_id: M.minji, share: 3000 },
  ],
  schedules: [{ id: 's1', day_index: 1, start_time: '12:00', title: '오사카성 공원' }],
  spotDone: ['train'],
};

Deno.test('머리말·파일명', () => {
  const r = buildReport(base);
  assertEquals(r.meta, '내보낸 시각 2026.11.10 14:32 · 내보낸 사람 민지');
  assertEquals(r.trip.period, '2026.10.20 – 10.23 (3박 4일)');
  assertEquals(r.trip.baseCurrency, 'JPY (환율 1엔 = 9.10원)');
  assertEquals(r.trip.participants, '민지(방장), 지훈, 서연, 엄마(게스트)');
  assertEquals(r.filename('xlsx'), 'Splito_오사카교토_20261020-1023_민지.xlsx');
});

Deno.test('지출 줄: 여행 전이 먼저, 날짜→시간 순, 라벨 변환', () => {
  const r = buildReport(base);
  assertEquals(r.rows.map((x) => x.id), ['pre', 'train', 'ramen', 'wait', 'snack']);
  const [pre, train, ramen, wait, snack] = r.rows;
  assertEquals([pre.day, pre.input, pre.category, pre.rate], ['여행 전', '자동 등록', '숙소', null]);
  assertEquals([train.day, train.time, train.payer, train.spot, train.split], ['1일차', '09:10', '지훈', '완료', '1/N']);
  assertEquals([ramen.schedule, ramen.split, ramen.participants], ['오사카성 공원', '품목별', '민지, 지훈, 서연']);
  assertEquals(ramen.shares, [2000, 3550, 3550, 0]);
  assertEquals([snack.visibility, snack.split, snack.time, snack.shares], ['나만', '나만 보기', '', [3000, 0, 0, 0]]);
  assertEquals([wait.krw, wait.shares], [null, [0, 0, 0, 0]]);
});

Deno.test('합계: 공동 지출과 내가 쓴 금액', () => {
  const r = buildReport(base);
  assertEquals(r.columns, ['민지', '지훈', '서연', '엄마']);
  assertEquals(r.totals, { shared: 58200, pre: 40000, during: 18200, mine: 17275, minePre: 10000 });
  assertEquals(r.mine.map((x) => [x.id, x.mine]), [['pre', 10000], ['train', 2275], ['ramen', 2000], ['snack', 3000]]);
  assertEquals(r.mine[3].title, '편의점 (나만 보기)');
});

Deno.test('날짜별 합계: 공동만 몫에, 내가 쓴 금액엔 나만 보기도', () => {
  const r = buildReport(base);
  assertEquals(r.days.map((d) => [d.day, d.date, d.schedule, d.shared, d.mine]), [
    ['여행 전', '2026.10.19', '', 40000, 10000],
    ['1일차', '2026.10.20', '오사카성 공원', 18200, 4275],
    ['2일차', '2026.10.21', '', 0, 3000],
  ]);
  assertEquals(r.days[1].shares, [4275, 5825, 5825, 2275]);
});

Deno.test('사람별 정리: 차액 합 0, 공금은 한 줄', () => {
  const pool = {
    ...base,
    expenses: [...base.expenses, exp({ id: 'pool', payer_kind: 'pool', payer_member_id: null, krw_amount: 900 })],
    scope: [...base.scope, { expense_id: 'pool', member_id: M.jihun }],
    shares: [...base.shares, { expense_id: 'pool', member_id: M.jihun, share: 900 }],
  };
  const r = buildReport(pool);
  assertEquals(r.people.map((p) => [p.name, p.role, p.paid, p.spent, p.diff]), [
    ['민지', '방장', 49100, 14275, 34825],
    ['지훈', '참여자', 9100, 16725, -7625],
    ['서연', '참여자', 0, 15825, -15825],
    ['엄마', '게스트', 0, 12275, -12275],
    ['공금', '', 900, 0, 900],
  ]);
  assertEquals(r.people.reduce((s, p) => s + p.diff, 0), 0);
});

Deno.test('나간 사람은 (나감)', () => {
  const r = buildReport({
    ...base,
    members: [...base.members, { id: M.gone, kind: 'user', userId: U.gone, name: '현우', leftAt: '2026-10-22T00:00:00Z', spotOnly: false }],
    expenses: [...base.expenses, exp({ id: 'g', payer_member_id: M.gone, created_by: U.gone, krw_amount: 500 })],
    scope: [...base.scope, { expense_id: 'g', member_id: M.gone }],
    shares: [...base.shares, { expense_id: 'g', member_id: M.gone, share: 500 }],
  });
  assertEquals(r.columns.at(-1), '현우 (나감)');
  assertEquals(r.rows.find((x) => x.id === 'g')?.payer, '현우 (나감)');
});

Deno.test('차액 합이 0이 아니면 실패', () => {
  assertThrows(
    () => buildReport({ ...base, shares: base.shares.filter((s) => !(s.expense_id === 'train' && s.member_id === M.mom)) }),
    Error,
    'EXPORT_INVARIANT',
  );
});
