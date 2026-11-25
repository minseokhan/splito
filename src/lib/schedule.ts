// 패키지 일정 표시 로직. 정산·순잔액과 무관한 표시용 메타데이터다(ADR-006: 계산의 정답은 서버).
import { weekday } from './feed';

export const PRE_TRIP = 'pre-trip';

const DAY_MS = 24 * 60 * 60 * 1000;

const utc = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type ScheduleItem = {
  id: string;
  dayIndex: number; // 0 = 여행 전
  startTime: string | null; // HH:MM. 자유여행 일정은 시간이 없다
  position: number; // 날짜 안 순서(위→아래). 시간순 자리는 서버가 저장할 때 맞춘다
  title: string;
  includes: string[];
  excludes: string[];
  optional: boolean;
  estAmount: number;
  edited: boolean; // '직접 수정' 배지
};

// 일정 영역이 지출에서 보는 것은 이것뿐이다. 화면은 더 넓은 행을 그대로 넘긴다.
export type SchedulableExpense = {
  id: string;
  scheduleId: string | null;
  paidLocalDate: string;
  paidLocalTime: string | null;
  createdAt: string;
  krwAmount: number | null;
};

export type ScheduleCard<E> = {
  item: ScheduleItem;
  expenses: E[];
  sum: number; // 연결된 지출의 원화 합(내 몫이 아니라 결제 총액)
  showEst: boolean; // 선택관광이고 연결된 지출이 없을 때만
};

export type ScheduleDay<E> = {
  key: string; // 'pre-trip' | 'YYYY-MM-DD' — 기간 탭의 키와 같다
  dayIndex: number;
  header: string; // '1일차 · 10.20 (월)' / '여행 전'
  cards: ScheduleCard<E>[];
  hiddenCount: number;
  extraLabel: string;
  extra: E[];
  daySum: number; // 그날 전체(일정 연결분 + 그 외) 원화 합
  hasExpense: boolean; // 지출이 하나도 없으면 합계를 쓰지 않는다
};

export function dayKeyOfIndex(dayIndex: number, startDate: string | null): string {
  if (dayIndex <= 0 || !startDate) return PRE_TRIP;
  return iso(utc(startDate) + (dayIndex - 1) * DAY_MS);
}

// 결제일 → 일차. 여행 기간 밖이면 '여행 전'으로 접는다(명세 §7).
export function dayIndexOfDate(date: string, startDate: string | null, endDate: string | null): number {
  if (!startDate || date < startDate) return 0;
  if (endDate && date > endDate) return 0;
  return Math.floor((utc(date) - utc(startDate)) / DAY_MS) + 1;
}

function header(dayIndex: number, startDate: string | null): string {
  if (dayIndex === 0) return '여행 전';
  const key = dayKeyOfIndex(dayIndex, startDate);
  // 기간이 없으면 날짜를 못 만든다. 그때만 일차로 떨어진다.
  if (key === PRE_TRIP) return `${dayIndex}일차`;
  const [, m, d] = key.split('-').map(Number);
  return `${dayIndex}일차 · ${m}.${d} (${weekday(key)})`;
}

// 결제 시각 오름차순(노션 11번). 시각을 모르면 기록 시각으로 잇는다.
const paidOrder = (e: SchedulableExpense) => `${e.paidLocalDate} ${e.paidLocalTime ?? ''} ${e.createdAt}`;

type Args<E extends SchedulableExpense> = {
  items: ScheduleItem[];
  expenses: E[];
  hiddenIds: string[];
  startDate: string | null;
  endDate: string | null;
};

export function buildScheduleDays<E extends SchedulableExpense>({
  items,
  expenses,
  hiddenIds,
  startDate,
  endDate,
}: Args<E>): ScheduleDay<E>[] {
  const hidden = new Set(hiddenIds);
  const byItem = new Map<string, E[]>(items.map((i) => [i.id, []]));
  const loose: E[] = [];
  // 사라진 일정을 가리키는 지출은 연결이 없는 것으로 본다(연동 해제 후 schedule_id를 보관하므로 생긴다).
  const sorted = [...expenses].sort((a, b) => paidOrder(a).localeCompare(paidOrder(b)));
  for (const e of sorted) {
    const bucket = e.scheduleId ? byItem.get(e.scheduleId) : undefined;
    if (bucket) bucket.push(e);
    else loose.push(e);
  }

  const tripDays = startDate ? Math.floor((utc(endDate && endDate >= startDate ? endDate : startDate) - utc(startDate)) / DAY_MS) + 1 : 0;
  const maxDay = Math.max(tripDays, ...items.map((i) => i.dayIndex), 0);

  const out: ScheduleDay<E>[] = [];
  for (let d = 0; d <= maxDay; d += 1) {
    const dayItems = items.filter((i) => i.dayIndex === d).sort((a, b) => a.position - b.position);
    const cards: ScheduleCard<E>[] = [];
    let hiddenCount = 0;
    for (const it of dayItems) {
      const linked = byItem.get(it.id) ?? [];
      // 숨김은 '지출이 아직 없는 선택관광'에만 먹는다. 지출이 붙으면 다시 보여야 한다.
      if (it.optional && linked.length === 0 && hidden.has(it.id)) {
        hiddenCount += 1;
        continue;
      }
      cards.push({
        item: it,
        expenses: linked,
        sum: linked.reduce((s, e) => s + (e.krwAmount ?? 0), 0),
        showEst: it.optional && linked.length === 0,
      });
    }
    const extra = loose.filter((e) => dayIndexOfDate(e.paidLocalDate, startDate, endDate) === d);
    // 숨긴 카드는 '지출이 없는 선택관광'뿐이라 합계에서 빠질 지출이 없다.
    const dayExpenses = [...cards.flatMap((c) => c.expenses), ...extra];
    out.push({
      key: dayKeyOfIndex(d, startDate),
      dayIndex: d,
      header: header(d, startDate),
      cards,
      hiddenCount,
      extraLabel: d === 0 ? '여행 전 지출' : '그 외 지출',
      extra,
      daySum: dayExpenses.reduce((s, e) => s + (e.krwAmount ?? 0), 0),
      hasExpense: dayExpenses.length > 0,
    });
  }
  return out;
}
