// 내 통계 순수 로직(docs/design/specs/my-stats-spec.md). 금액은 원 단위 정수, 나눗셈은 floor.
// 정산 계산과는 독립이다 — room_balances를 건드리지 않는다(명세 §0).
import { CATEGORIES, categoryLabel, type CategoryCode } from './category';
import { allocateLargestRemainder, floorDiv, formatKrw, roundHalfAwayFromZero } from './money';
import { md } from './tripDays';
import type { Krw, MyShare } from '../types/domain';

/** 계획 소진 비율의 기준점(오늘 0.5일). 명세 §12-1 '확인 필요' — 조정 가능한 상수로 둔다. */
export const PLAN_DAY_OFFSET = 0.5;

/** 항공·숙박은 예산에서 뺀다(명세 §0). 카테고리별 지출 카드에는 그대로 보여준다. */
export const BUDGET_EXCLUDED_CATEGORIES: CategoryCode[] = ['lodging'];

export function isBudgetTarget(category: CategoryCode | null): boolean {
  return category === null || !BUDGET_EXCLUDED_CATEGORIES.includes(category);
}

/** 100원 단위 반올림. 정수 연산만 쓴다. */
export function round100(v: number): number {
  return floorDiv(v + 50, 100) * 100;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// 기기 시간대와 무관하게 UTC로 날짜를 다룬다(tripDays.ts와 같은 규칙).
const utc = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY_MS);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 여행 일수 N. 시작·종료일을 포함한다. */
export function tripLength(startDate: string, endDate: string | null): number {
  if (!endDate || endDate < startDate) return 1;
  return daysBetween(startDate, endDate) + 1;
}

/** 오늘이 몇 일차인지(1부터). 기간 밖이면 0 이하 또는 N 초과를 그대로 돌려준다. */
export function dayIndex(startDate: string, today: string): number {
  return daysBetween(startDate, today) + 1;
}

export type DayChip = { key: string; label: string; sub: string; disabled: boolean };

/** 기간 칩: 전체 · 1일차 · 2일차 … 오늘 이후는 비활성(명세 §2). */
export function tripDayChips(startDate: string, endDate: string | null, today: string): DayChip[] {
  const chips: DayChip[] = [{ key: 'all', label: '전체', sub: '', disabled: false }];
  const n = tripLength(startDate, endDate);
  for (let i = 0; i < n; i += 1) {
    const key = iso(utc(startDate) + i * DAY_MS);
    chips.push({ key, label: `${i + 1}일차`, sub: key === today ? '오늘' : md(key), disabled: key > today });
  }
  return chips;
}

/** 기간 칩 필터. day는 'all' 또는 'YYYY-MM-DD'. */
export function filterByDay(shares: MyShare[], day: string): MyShare[] {
  return day === 'all' ? shares : shares.filter((s) => s.paidLocalDate === day);
}

export type BudgetState = 'NONE' | 'OVER' | 'FAST' | 'NORMAL';

export type BudgetStats = {
  state: BudgetState;
  budget: Krw;
  spent: Krw;
  spentBeforeToday: Krw;
  todaySpent: Krw;
  over: Krw;
  remain: Krw;
  /** 소진 비율(금액 아님). 1을 넘을 수 있다. */
  pct: number;
  /** 계획 소진 비율 0~1. */
  plan: number;
  /** 오늘을 포함한 남은 일수. */
  daysLeft: number;
  rec: Krw;
  todayLeft: Krw;
  /** 오늘을 뺀 남은 일수. */
  n: number;
  per: Krw;
  d: number;
  N: number;
  beforeTrip: boolean;
  afterTrip: boolean;
};

type StatsArgs = { budget: Krw | null; shares: MyShare[]; startDate: string; endDate: string | null; today: string };

export function budgetStats({ budget, shares, startDate, endDate, today }: StatsArgs): BudgetStats {
  const N = tripLength(startDate, endDate);
  const d = dayIndex(startDate, today);
  const target = shares.filter((s) => isBudgetTarget(s.category) && s.paidLocalDate >= startDate && s.paidLocalDate <= today);
  const sum = (rows: MyShare[]) => rows.reduce((a, s) => a + s.myShare, 0);
  const spent = sum(target);
  const todaySpent = sum(target.filter((s) => s.paidLocalDate === today));
  const spentBeforeToday = spent - todaySpent;

  const total = budget && budget > 0 ? budget : 0;
  const plan = clamp((d - PLAN_DAY_OFFSET) / N, 0, 1);
  const pct = total > 0 ? spent / total : 0;
  const state: BudgetState = total === 0 ? 'NONE' : spent > total ? 'OVER' : pct > plan ? 'FAST' : 'NORMAL';

  const daysLeft = clamp(N - d + 1, 0, N);
  const rec = daysLeft > 0 ? Math.max(0, round100(floorDiv(total - spentBeforeToday, daysLeft))) : 0;
  const n = Math.max(0, N - d);
  const remain = Math.max(0, total - spent);

  return {
    state,
    budget: total,
    spent,
    spentBeforeToday,
    todaySpent,
    over: Math.max(0, spent - total),
    remain,
    pct,
    plan,
    daysLeft,
    rec,
    todayLeft: Math.max(0, rec - todaySpent),
    n,
    per: n > 0 ? round100(floorDiv(remain, n)) : 0,
    d,
    N,
    beforeTrip: d < 1,
    afterTrip: d > N,
  };
}

// ─── 응원 문구 (명세 §3-4) ───

export type CheerVersion = 1 | 2 | 3 | 4;
export type Cheer = { title: string; body: string };
export type CheerVars = { per: Krw; tl: Krw; remain: Krw; n: number };

const CHEERS: Record<'FAST' | 'NORMAL', Record<CheerVersion, Cheer>> = {
  FAST: {
    1: { title: '계획보다 빠르게 쓰고 있어요.', body: '남은 {n}일은 하루 {per}씩 쓰면 딱 맞아요.' },
    2: { title: '아직 충분해요!', body: '남은 {n}일, 하루 {per}씩이면 예산 안에서 끝나요.' },
    3: { title: '조금만 나눠 쓰면 돼요.', body: '오늘은 {tl} 더 써도 괜찮아요.' },
    4: { title: '예산 안에서 잘 가고 있어요.', body: '남은 {remain}으로 {n}일 더 즐겨요.' },
  },
  NORMAL: {
    1: { title: '이대로 쓰면 돼요.', body: '지금 속도면 예산 안에서 여행이 끝나요.' },
    2: { title: '여유 있어요!', body: '오늘 {tl} 더 써도 괜찮아요.' },
    3: { title: '계획보다 아끼고 있어요.', body: '남은 {n}일은 하루 {per}까지 써도 돼요.' },
    4: { title: '잘하고 있어요.', body: '남은 {remain}, 마음 편히 즐겨요.' },
  },
};

// 마지막 날(n = 0)에는 {per}·{n}이, 오늘 쓸 돈이 없으면(tl = 0) {tl}이 들어간 버전을 쓰지 않는다.
// TODO(확인 필요): 명세 §3-4는 "2·4로 대체"라고 적었지만 FAST 2는 {per}, FAST 4는 {n}을 쓴다.
// 표와 규칙이 어긋나므로 '쓸 수 없는 변수가 없는 버전'을 고르는 일반 규칙으로 구현했다.
const usable = (c: Cheer, v: CheerVars) => {
  const text = `${c.title}${c.body}`;
  if (v.n === 0 && (text.includes('{per}') || text.includes('{n}'))) return false;
  return !(v.tl === 0 && text.includes('{tl}'));
};

// TODO(확인 필요): FAST이면서 n = 0, tl = 0이면 쓸 수 있는 표 문구가 없어 마지막 날 전용 문구를 넣었다.
const LAST_RESORT: Record<'FAST' | 'NORMAL', Cheer> = {
  FAST: { title: '오늘이 마지막 날이에요.', body: '남은 {remain} 안에서 마무리해요.' },
  NORMAL: CHEERS.NORMAL[1],
};

const FALLBACK_ORDER: CheerVersion[] = [2, 4, 3, 1];

export function pickCheer(state: 'FAST' | 'NORMAL', version: CheerVersion, vars: CheerVars): Cheer {
  const table = CHEERS[state];
  const picked =
    [version, ...FALLBACK_ORDER].map((v) => table[v]).find((c) => usable(c, vars)) ?? LAST_RESORT[state];
  const fill = (s: string) =>
    s
      .replaceAll('{per}', formatKrw(vars.per))
      .replaceAll('{tl}', formatKrw(vars.tl))
      .replaceAll('{remain}', formatKrw(vars.remain))
      .replaceAll('{n}', String(vars.n));
  return { title: fill(picked.title), body: fill(picked.body) };
}

// ─── 전날 대비 (명세 §6-1) ───

/** 일차별 내 몫 합계. 숙소는 뺀다. */
export function dailyTotals(shares: MyShare[], startDate: string, n: number): Krw[] {
  const out = new Array<Krw>(n).fill(0);
  for (const s of shares) {
    if (!isBudgetTarget(s.category)) continue;
    const i = daysBetween(startDate, s.paidLocalDate);
    if (i >= 0 && i < n) out[i] += s.myShare;
  }
  return out;
}

export function compareYesterday(daily: Krw[], d: number): { top: string; bottom: string } {
  if (d <= 1) return { top: '여행 첫날이에요', bottom: '' };
  const today = daily[d - 1] ?? 0;
  const yesterday = daily[d - 2] ?? 0;
  const diff = today - yesterday;
  if (diff === 0) return { top: '어제와 같은 금액이에요', bottom: '' };
  const word = diff > 0 ? '더' : '덜';
  const top = `어제보다 ${formatKrw(Math.abs(diff))}`;
  // TODO(확인 필요): 어제 지출이 0원이면 비율을 낼 수 없어 퍼센트를 생략한다(명세에 없음).
  if (yesterday === 0) return { top, bottom: `${word} 썼어요` };
  const pct = roundHalfAwayFromZero((diff / yesterday) * 100);
  return { top, bottom: `${word} 썼어요 (${pct > 0 ? '+' : '−'}${Math.abs(pct)}%)` };
}

// ─── 카테고리 배분 (명세 §4) ───

/** 예산을 나눌 카테고리. 숙소는 예산에서 빠지므로 없다. */
export const ALLOC_CATEGORIES: CategoryCode[] = ['food', 'transport', 'shopping', 'sightseeing', 'other'];

// 지출이 없을 때 쓰는 기본 비율(명세 §4 예시 38 / 8 / 30 / 20 / 4%).
const DEFAULT_ALLOC_RATIO = [38, 8, 30, 20, 4];

/** 지금까지 지출 비율로 예산을 나눈다. budget-coach가 실패했을 때 쓰는 클라이언트 대체안. */
export function allocByRatio(totalKrw: Krw, spent: Partial<Record<CategoryCode, Krw>>): Partial<Record<CategoryCode, Krw>> {
  const used = ALLOC_CATEGORIES.map((c) => spent[c] ?? 0);
  const weights = used.some((x) => x > 0) ? used : DEFAULT_ALLOC_RATIO;
  const out = allocateLargestRemainder(totalKrw, weights.map((amount, position) => ({ position, amount })));
  return Object.fromEntries(ALLOC_CATEGORIES.map((c, i) => [c, out[i]]));
}

// ─── AI 예산 코칭 카드 (명세 §5) ───

export type CoachCard = { title: string; sub: string; danger: boolean; hasPlans: boolean };

/** 하루 권장 기준선 = budget / N(명세 §6-1 기준선과 같은 값). */
export const dailyBaseline = (budget: Krw, N: number) => (N > 0 ? round100(floorDiv(budget, N)) : 0);

/** 코칭 카드 문구. NONE이면 카드를 숨긴다(null). */
export function coachCard(stats: BudgetStats, yesterdaySpent: Krw, appliedPlanTitle: string | null): CoachCard | null {
  if (stats.state === 'NONE') return null;
  const plain = { danger: false, hasPlans: false };
  // TODO(확인 필요): 명세 §11은 여행 시작 전 문구를 '확인 필요'로 남겼다. 아래 문구를 기본값으로 쓴다.
  if (stats.beforeTrip) return { title: '여행이 시작되면 알려드릴게요', sub: '', ...plain };
  if (stats.state === 'OVER') return { title: `예산 초과 +${formatKrw(stats.over)}`, sub: '', danger: true, hasPlans: false };
  if (appliedPlanTitle) {
    return { title: `'${appliedPlanTitle}' 안을 적용했어요`, sub: `하루 ${formatKrw(stats.per)} 기준이에요`, danger: false, hasPlans: true };
  }
  if (stats.d <= 1) return { title: '오늘 지출이 끝나면 추천해 드릴게요', sub: '', ...plain };
  if (stats.state === 'FAST') {
    const over = yesterdaySpent - dailyBaseline(stats.budget, stats.N);
    return {
      title: over > 0 ? `${stats.d - 1}일차에 하루 권장액보다 ${formatKrw(over)} 더 썼어요` : '계획보다 빠르게 쓰고 있어요',
      sub: '남은 일정은 조정안을 참고해 나눠 쓸 수 있어요.',
      danger: false,
      hasPlans: true,
    };
  }
  const sub = stats.n > 0 ? `남은 ${stats.n}일, 하루 ${formatKrw(stats.per)}씩 쓰면 돼요.` : `남은 예산은 ${formatKrw(stats.remain)}이에요.`;
  return { title: '지금 페이스면 예산 안이에요', sub, ...plain };
}

// ─── 카테고리별 지출 (명세 §6-2) ───

export type CategoryRow = { code: CategoryCode; label: string; amount: Krw; ratio: number };

/** 6종 전부, 금액 큰 순. 비율은 전체 대비. 숙소도 포함한다. */
export function categoryBreakdown(shares: MyShare[]): CategoryRow[] {
  const amounts = new Map<CategoryCode, Krw>(CATEGORIES.map((c) => [c.code, 0]));
  for (const s of shares) {
    const code: CategoryCode = s.category ?? 'other';
    amounts.set(code, (amounts.get(code) ?? 0) + s.myShare);
  }
  const total = [...amounts.values()].reduce((a, b) => a + b, 0);
  return CATEGORIES.map(({ code }) => {
    const amount = amounts.get(code) ?? 0;
    return { code, label: categoryLabel(code), amount, ratio: total > 0 ? amount / total : 0 };
  }).sort((a, b) => b.amount - a.amount);
}

// ─── 지출 저장 연동 (명세 §8 · §9-4) ───

type DraftShare = {
  /** previewKrw의 박스별 원화. items와 같은 순서다. */
  boxKrw: Krw[];
  items: { assigneeMemberIds: string[] }[];
  scopeMemberIds: string[];
  payerMemberId: string | null;
  meMemberId: string | null;
};

/**
 * 저장 전 미리보기: 이 지출에서 내가 질 몫.
 * 서버 save_expense·room_balances와 같은 규칙이다 — 박스마다 (지정 ∩ 대상) 인원으로 1/N floor,
 * 자투리는 결제자가 진다. 지정이 비면 대상 인원 전체.
 */
export function myShareOfDraft({ boxKrw, items, scopeMemberIds, payerMemberId, meMemberId }: DraftShare): Krw {
  if (!meMemberId) return 0;
  const scope = new Set(scopeMemberIds);
  let mine = 0;
  items.forEach((it, i) => {
    const krw = boxKrw[i] ?? 0;
    const picked = it.assigneeMemberIds.filter((m) => scope.has(m));
    const eff = picked.length ? picked : scopeMemberIds;
    if (!eff.length) return;
    const q = floorDiv(krw, eff.length);
    if (eff.includes(meMemberId)) mine += q;
    if (payerMemberId === meMemberId) mine += krw - q * eff.length;
  });
  return mine;
}

/**
 * CTA 위 한 줄 안내. 예산이 없거나 넘지 않으면 null.
 * 저장을 막지는 않는다(명세 §8).
 */
export function overRecWarning(stats: BudgetStats | null, addKrw: Krw): string | null {
  if (!stats || stats.state === 'NONE' || stats.rec <= 0) return null;
  const over = stats.todaySpent + addKrw - stats.rec;
  if (over <= 0) return null;
  return `저장하면 오늘 권장액을 ${formatKrw(over)} 넘어요`;
}
