// 패키지 일정 표시 로직. 정산·순잔액과 무관한 표시용 메타데이터다(ADR-006: 계산의 정답은 서버).
import { md } from './tripDays';

export const PRE_TRIP = 'pre-trip';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

const utc = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type ScheduleItem = {
  id: string;
  dayIndex: number; // 0 = 여행 전
  startTime: string; // HH:MM
  title: string;
  includes: string[];
  excludes: string[];
  optional: boolean;
  estAmount: number;
  edited: boolean; // '직접 수정' 배지
};

// 일정 영역이 지출에서 보는 것은 이 셋뿐이다. 화면은 더 넓은 행을 그대로 넘긴다.
export type SchedulableExpense = {
  id: string;
  scheduleId: string | null;
  paidLocalDate: string;
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
  header: string;
  cards: ScheduleCard<E>[];
  hiddenCount: number;
  extraLabel: string;
  extra: E[];
};

export function isValidScheduleTime(value: string): boolean {
  const m = TIME_RE.exec(value);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

// '9:30' → '09:30'. 유효하지 않으면 그대로 돌려준다(검증은 호출부가 따로 한다).
export function normalizeScheduleTime(value: string): string {
  const m = TIME_RE.exec(value);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : value;
}

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

function header(dayIndex: number, startDate: string | null, lead: string | undefined): string {
  if (dayIndex === 0) return '여행 전';
  const key = dayKeyOfIndex(dayIndex, startDate);
  if (key === PRE_TRIP) return `${dayIndex}일차`;
  const w = WEEKDAYS[new Date(utc(key)).getUTCDay()];
  return `${dayIndex}일차 · ${md(key)} (${w})${lead ? ` · ${lead}` : ''}`;
}

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
  for (const e of expenses) {
    const bucket = e.scheduleId ? byItem.get(e.scheduleId) : undefined;
    if (bucket) bucket.push(e);
    else loose.push(e);
  }

  const tripDays = startDate ? Math.floor((utc(endDate && endDate >= startDate ? endDate : startDate) - utc(startDate)) / DAY_MS) + 1 : 0;
  const maxDay = Math.max(tripDays, ...items.map((i) => i.dayIndex), 0);

  const out: ScheduleDay<E>[] = [];
  for (let d = 0; d <= maxDay; d += 1) {
    // 같은 시간이면 입력 순서를 지킨다 — sort는 안정 정렬이다.
    const dayItems = items.filter((i) => i.dayIndex === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
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
    out.push({
      key: dayKeyOfIndex(d, startDate),
      dayIndex: d,
      header: header(d, startDate, dayItems[0]?.title),
      cards,
      hiddenCount,
      extraLabel: d === 0 ? '여행 전 지출' : '그 외 지출',
      extra,
    });
  }
  return out;
}
