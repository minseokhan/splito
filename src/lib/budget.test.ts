import type { CategoryCode } from './category';
import type { BudgetStats } from './budget';
import {
  BUDGET_EXCLUDED_CATEGORIES,
  PLAN_DAY_OFFSET,
  allocByRatio,
  budgetStats,
  categoryBreakdown,
  coachCard,
  compareYesterday,
  dailyTotals,
  dayIndex,
  filterByDay,
  isBudgetTarget,
  myShareOfDraft,
  overRecWarning,
  pickCheer,
  round100,
  tripDayChips,
  tripLength,
} from './budget';
import type { MyShare } from '../types/domain';

const START = '2026-10-20';
const END = '2026-10-23'; // N = 4

function share(paidLocalDate: string, myShare: number, category: CategoryCode | null = 'food'): MyShare {
  return {
    expenseId: `e-${paidLocalDate}-${myShare}-${category}`,
    paidLocalDate,
    category,
    merchant: '가게',
    payerKind: 'member',
    payerMemberId: 'm1',
    visibility: 'shared',
    currency: 'JPY',
    amountOriginal: 1000,
    krwAmount: myShare,
    myShare,
  };
}

describe('round100', () => {
  it('100원 단위로 반올림한다', () => {
    expect(round100(0)).toBe(0);
    expect(round100(49)).toBe(0);
    expect(round100(50)).toBe(100);
    expect(round100(117_749)).toBe(117_700);
    expect(round100(117_750)).toBe(117_800);
  });

  it('정수만 돌려준다', () => {
    expect(Number.isInteger(round100(33_333))).toBe(true);
  });
});

describe('예산 대상', () => {
  it('숙소는 예산 계산에서 뺀다', () => {
    expect(BUDGET_EXCLUDED_CATEGORIES).toEqual(['lodging']);
    expect(isBudgetTarget('lodging')).toBe(false);
    expect(isBudgetTarget('food')).toBe(true);
    expect(isBudgetTarget(null)).toBe(true); // 미분류는 기타 취급
  });
});

describe('여행 일수', () => {
  it('시작·종료일을 포함해 센다', () => {
    expect(tripLength(START, END)).toBe(4);
    expect(tripLength(START, START)).toBe(1);
    expect(tripLength(START, null)).toBe(1);
    expect(tripLength(START, '2026-10-19')).toBe(1); // 뒤집힌 값은 하루로 본다
  });

  it('d는 1부터 세고 기간 밖도 그대로 돌려준다', () => {
    expect(dayIndex(START, START)).toBe(1);
    expect(dayIndex(START, '2026-10-22')).toBe(3);
    expect(dayIndex(START, '2026-10-19')).toBe(0);
    expect(dayIndex(START, '2026-10-25')).toBe(6);
  });
});

describe('tripDayChips', () => {
  const chips = tripDayChips(START, END, '2026-10-21');

  it('전체 + 일차 칩을 만든다', () => {
    expect(chips.map((c) => c.key)).toEqual(['all', START, '2026-10-21', '2026-10-22', '2026-10-23']);
    expect(chips[1].label).toBe('1일차');
    expect(chips[1].sub).toBe('10.20');
  });

  it('오늘은 날짜 대신 오늘로 쓰고 이후는 비활성이다', () => {
    expect(chips[2].sub).toBe('오늘');
    expect(chips[2].disabled).toBe(false);
    expect(chips[3].disabled).toBe(true);
    expect(chips[4].disabled).toBe(true);
    expect(chips[0].disabled).toBe(false);
  });
});

describe('filterByDay', () => {
  const shares = [share(START, 1000), share('2026-10-21', 2000)];

  it('all이면 그대로 둔다', () => {
    expect(filterByDay(shares, 'all')).toHaveLength(2);
  });

  it('날짜 키면 그 날짜만 남긴다', () => {
    expect(filterByDay(shares, '2026-10-21').map((s) => s.myShare)).toEqual([2000]);
  });
});

describe('budgetStats', () => {
  const base = { startDate: START, endDate: END, today: '2026-10-21' };

  it('예산이 없으면 NONE이다', () => {
    const s = budgetStats({ ...base, budget: null, shares: [] });
    expect(s.state).toBe('NONE');
    expect(s.spent).toBe(0);
  });

  it('0 이하 예산도 NONE으로 본다', () => {
    expect(budgetStats({ ...base, budget: 0, shares: [] }).state).toBe('NONE');
  });

  it('숙소 지출과 여행 기간 밖 지출은 spent에서 뺀다', () => {
    const s = budgetStats({
      ...base,
      budget: 480_000,
      shares: [
        share(START, 100_000),
        share(START, 500_000, 'lodging'), // 숙소 제외
        share('2026-10-19', 70_000), // 여행 전 제외
        share('2026-10-21', 50_000),
      ],
    });
    expect(s.spent).toBe(150_000);
    expect(s.spentBeforeToday).toBe(100_000);
    expect(s.todaySpent).toBe(50_000);
  });

  it('spent > budget이면 OVER이고 초과액을 준다', () => {
    const s = budgetStats({ ...base, budget: 100_000, shares: [share(START, 130_000)] });
    expect(s.state).toBe('OVER');
    expect(s.over).toBe(30_000);
    expect(s.remain).toBe(0);
  });

  it('pct > plan이면 FAST다', () => {
    // d=2, N=4 → plan = (2 - 0.5) / 4 = 0.375
    const s = budgetStats({ ...base, budget: 480_000, shares: [share(START, 218_700)] });
    expect(s.plan).toBeCloseTo(0.375);
    expect(s.pct).toBeGreaterThan(0.375);
    expect(s.state).toBe('FAST');
  });

  it('pct <= plan이면 NORMAL이다', () => {
    const s = budgetStats({ ...base, budget: 480_000, shares: [share(START, 100_000)] });
    expect(s.state).toBe('NORMAL');
  });

  it('plan 기준점은 조정 가능한 상수다', () => {
    expect(PLAN_DAY_OFFSET).toBe(0.5);
  });

  it('rec = round100((budget − spentBeforeToday) / daysLeft)', () => {
    // d=2, N=4 → daysLeft = 3. (480,000 − 127,000) / 3 = 117,666.6… → 117,700
    const s = budgetStats({ ...base, budget: 480_000, shares: [share(START, 127_000)] });
    expect(s.daysLeft).toBe(3);
    expect(s.rec).toBe(117_700);
    expect(s.todayLeft).toBe(117_700);
  });

  it('오늘 남은 금액은 음수가 되지 않는다', () => {
    const s = budgetStats({
      ...base,
      budget: 480_000,
      shares: [share(START, 127_000), share('2026-10-21', 200_000)],
    });
    expect(s.todaySpent).toBe(200_000);
    expect(s.todayLeft).toBe(0);
  });

  it('오늘 제외 남은 일수 n과 per를 준다', () => {
    const s = budgetStats({ ...base, budget: 480_000, shares: [share(START, 218_700)] });
    expect(s.n).toBe(2);
    expect(s.remain).toBe(261_300);
    expect(s.per).toBe(130_700); // floor(261,300 / 2) = 130,650 → 130,700
  });

  it('마지막 날이면 n = 0, per = 0이다', () => {
    const s = budgetStats({ ...base, today: END, budget: 480_000, shares: [share(START, 100_000)] });
    expect(s.n).toBe(0);
    expect(s.per).toBe(0);
    expect(s.daysLeft).toBe(1);
  });

  it('여행 시작 전이면 beforeTrip이고 spent는 0이다', () => {
    const s = budgetStats({ ...base, today: '2026-10-18', budget: 480_000, shares: [share(START, 100_000)] });
    expect(s.beforeTrip).toBe(true);
    expect(s.spent).toBe(0);
    expect(s.plan).toBe(0);
  });

  it('여행이 끝났으면 afterTrip이고 daysLeft는 0이다', () => {
    const s = budgetStats({ ...base, today: '2026-10-25', budget: 480_000, shares: [share(START, 100_000)] });
    expect(s.afterTrip).toBe(true);
    expect(s.daysLeft).toBe(0);
    expect(s.rec).toBe(0);
    expect(s.todayLeft).toBe(0);
  });

  it('금액은 전부 정수다', () => {
    const s = budgetStats({ ...base, budget: 333_333, shares: [share(START, 77_777)] });
    for (const v of [s.spent, s.remain, s.rec, s.todayLeft, s.per, s.over]) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('pickCheer', () => {
  const vars = { per: 130_700, tl: 26_000, remain: 261_300, n: 2 };

  it('요청한 버전의 FAST 문구를 채운다', () => {
    expect(pickCheer('FAST', 1, vars)).toEqual({
      title: '계획보다 빠르게 쓰고 있어요.',
      body: '남은 2일은 하루 130,700원씩 쓰면 딱 맞아요.',
    });
  });

  it('NORMAL 문구도 버전별로 다르다', () => {
    expect(pickCheer('NORMAL', 2, vars).body).toBe('오늘 26,000원 더 써도 괜찮아요.');
    expect(pickCheer('NORMAL', 4, vars).body).toBe('남은 261,300원, 마음 편히 즐겨요.');
  });

  it('n = 0이면 {per}·{n}이 든 버전을 쓰지 않는다', () => {
    const last = { per: 0, tl: 26_000, remain: 50_000, n: 0 };
    for (const v of [1, 2, 3, 4] as const) {
      for (const state of ['FAST', 'NORMAL'] as const) {
        const c = pickCheer(state, v, last);
        expect(`${c.title}${c.body}`).not.toMatch(/남은 0일|하루 0원|0일 더/);
      }
    }
  });

  it('tl = 0이면 {tl}이 든 버전을 쓰지 않는다', () => {
    const c = pickCheer('FAST', 3, { per: 10_000, tl: 0, remain: 20_000, n: 2 });
    expect(c.body).not.toContain('0원 더 써도');
  });

  it('n = 0이고 tl = 0이어도 문구를 돌려준다', () => {
    const c = pickCheer('FAST', 1, { per: 0, tl: 0, remain: 20_000, n: 0 });
    expect(c.title).toBeTruthy();
    expect(c.body).not.toContain('{');
  });

  it('치환되지 않은 자리표시자를 남기지 않는다', () => {
    for (const v of [1, 2, 3, 4] as const) {
      for (const state of ['FAST', 'NORMAL'] as const) {
        const c = pickCheer(state, v, vars);
        expect(`${c.title}${c.body}`).not.toContain('{');
      }
    }
  });
});

describe('dailyTotals / compareYesterday', () => {
  const shares = [
    share(START, 126_300),
    share(START, 100_000, 'lodging'), // 숙소 제외
    share('2026-10-21', 91_000),
    share('2026-10-22', 50_000),
  ];

  it('일차별 합계를 숙소 빼고 낸다', () => {
    expect(dailyTotals(shares, START, 4)).toEqual([126_300, 91_000, 50_000, 0]);
  });

  it('1일차는 첫날 문구를 쓴다', () => {
    expect(compareYesterday([126_300], 1)).toEqual({ top: '여행 첫날이에요', bottom: '' });
  });

  it('어제보다 덜 썼으면 음수 퍼센트를 붙인다', () => {
    expect(compareYesterday([126_300, 91_000], 2)).toEqual({
      top: '어제보다 35,300원',
      bottom: '덜 썼어요 (−28%)',
    });
  });

  it('어제보다 더 썼으면 양수 퍼센트를 붙인다', () => {
    expect(compareYesterday([100_000, 150_000], 2)).toEqual({
      top: '어제보다 50,000원',
      bottom: '더 썼어요 (+50%)',
    });
  });

  it('어제가 0원이면 퍼센트를 생략한다', () => {
    expect(compareYesterday([0, 30_000], 2)).toEqual({ top: '어제보다 30,000원', bottom: '더 썼어요' });
  });

  it('어제와 같으면 비교 문구를 바꾼다', () => {
    expect(compareYesterday([30_000, 30_000], 2)).toEqual({ top: '어제와 같은 금액이에요', bottom: '' });
  });
});

describe('allocByRatio', () => {
  it('지출 비율대로 나누고 합을 전체 예산에 맞춘다', () => {
    const alloc = allocByRatio(480_000, { food: 182_400, transport: 38_400, shopping: 144_000, sightseeing: 96_000, other: 19_200 });
    expect(alloc).toEqual({ food: 182_400, transport: 38_400, shopping: 144_000, sightseeing: 96_000, other: 19_200 });
  });

  it('숙소 지출은 배분에 넣지 않는다', () => {
    const alloc = allocByRatio(1000, { food: 100, lodging: 900 });
    expect(alloc).toEqual({ food: 1000, transport: 0, shopping: 0, sightseeing: 0, other: 0 });
  });

  it('지출이 없으면 기본 비율을 쓰고 합이 정확하다', () => {
    const alloc = allocByRatio(333_333, {});
    expect(Object.values(alloc).reduce((a, b) => a + (b ?? 0), 0)).toBe(333_333);
    expect(Object.values(alloc).every((v) => Number.isInteger(v))).toBe(true);
  });
});

describe('coachCard', () => {
  const stats = (over: Partial<Parameters<typeof budgetStats>[0]> = {}) =>
    budgetStats({ startDate: START, endDate: END, today: '2026-10-21', budget: 480_000, shares: [], ...over });

  it('예산이 없으면 카드를 숨긴다', () => {
    expect(coachCard(stats({ budget: null }), 0, null)).toBeNull();
  });

  it('여행 시작 전이면 시작 안내를 쓴다', () => {
    expect(coachCard(stats({ today: '2026-10-18' }), 0, null)?.title).toBe('여행이 시작되면 알려드릴게요');
  });

  it('1일차는 조정안을 내지 않는다', () => {
    const c = coachCard(stats({ today: START }), 0, null);
    expect(c).toEqual({ title: '오늘 지출이 끝나면 추천해 드릴게요', sub: '', danger: false, hasPlans: false });
  });

  it('OVER는 초과 금액만 빨갛게 쓴다', () => {
    const c = coachCard(stats({ shares: [share(START, 600_000)] }), 0, null);
    expect(c).toEqual({ title: '예산 초과 +120,000원', sub: '', danger: true, hasPlans: false });
  });

  it('FAST는 전날 초과분을 알리고 조정안을 연다', () => {
    // 하루 권장 기준선 480,000 / 4 = 120,000. 1일차 127,000 → +7,000
    const c = coachCard(stats({ shares: [share(START, 218_700)] }), 127_000, null);
    expect(c?.title).toBe('1일차에 하루 권장액보다 7,000원 더 썼어요');
    expect(c?.hasPlans).toBe(true);
  });

  it('NORMAL은 남은 일수 기준 요약을 쓴다', () => {
    const c = coachCard(stats({ shares: [share(START, 100_000)] }), 100_000, null);
    expect(c?.title).toBe('지금 페이스면 예산 안이에요');
    expect(c?.hasPlans).toBe(false);
  });

  it('조정안을 적용했으면 적용 문구로 바꾼다', () => {
    const c = coachCard(stats({ shares: [share(START, 218_700)] }), 127_000, '쇼핑 지키기');
    expect(c?.title).toBe("'쇼핑 지키기' 안을 적용했어요");
    expect(c?.hasPlans).toBe(true);
  });
});

describe('categoryBreakdown', () => {
  it('6종을 모두 내고 금액 큰 순으로 정렬한다', () => {
    const rows = categoryBreakdown([
      share(START, 30_000, 'food'),
      share(START, 10_000, 'food'),
      share(START, 60_000, 'lodging'),
      share(START, 10_000, null),
    ]);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.code)).toEqual(['lodging', 'food', 'other', 'shopping', 'sightseeing', 'transport']);
    // 전체 110,000원 대비 비율
    expect(rows[0]).toEqual({ code: 'lodging', label: '숙소', amount: 60_000, ratio: 60_000 / 110_000 });
    expect(rows[1].amount).toBe(40_000);
  });

  it('지출이 없으면 비율은 0이다', () => {
    const rows = categoryBreakdown([]);
    expect(rows.every((r) => r.amount === 0 && r.ratio === 0)).toBe(true);
  });
});

describe('myShareOfDraft (명세 §9-4)', () => {
  const base = { scopeMemberIds: ['a', 'b', 'c', 'd'], payerMemberId: 'a', meMemberId: 'b' };

  it('지정이 없으면 대상 인원 전체로 1/N floor', () => {
    expect(myShareOfDraft({ ...base, boxKrw: [1000], items: [{ assigneeMemberIds: [] }] })).toBe(250);
  });

  it('자투리는 결제자가 진다', () => {
    const items = [{ assigneeMemberIds: [] }];
    expect(myShareOfDraft({ ...base, meMemberId: 'a', boxKrw: [1001], items })).toBe(251);
    expect(myShareOfDraft({ ...base, meMemberId: 'b', boxKrw: [1001], items })).toBe(250);
  });

  it('지정된 사람만 나눈다. 대상 인원 밖 지정은 버린다', () => {
    const items = [{ assigneeMemberIds: ['b', 'z'] }];
    expect(myShareOfDraft({ ...base, boxKrw: [1000], items })).toBe(1000);
    expect(myShareOfDraft({ ...base, meMemberId: 'c', boxKrw: [1000], items })).toBe(0);
  });

  it('박스가 여럿이면 합산한다', () => {
    expect(
      myShareOfDraft({ ...base, boxKrw: [1000, 400], items: [{ assigneeMemberIds: [] }, { assigneeMemberIds: ['b'] }] }),
    ).toBe(650);
  });

  it('참여자가 아니면 0', () => {
    expect(myShareOfDraft({ ...base, meMemberId: null, boxKrw: [1000], items: [{ assigneeMemberIds: [] }] })).toBe(0);
  });
});

describe('overRecWarning (명세 §8)', () => {
  const stats = { state: 'NORMAL', rec: 100000, todaySpent: 30000 } as unknown as BudgetStats;

  it('예산이 없으면 안내하지 않는다', () => {
    expect(overRecWarning(null, 999999)).toBeNull();
    expect(overRecWarning({ ...stats, state: 'NONE' }, 999999)).toBeNull();
  });

  it('권장액을 넘지 않으면 null', () => {
    expect(overRecWarning(stats, 70000)).toBeNull();
  });

  it('넘는 금액을 원 단위로 알려준다', () => {
    expect(overRecWarning(stats, 82000)).toBe('저장하면 오늘 권장액을 12,000원 넘어요');
  });
});
