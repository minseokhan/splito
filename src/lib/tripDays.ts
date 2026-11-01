import type { FeedSection } from './feed';

// bottom이 null인 칸('전체')은 top 한 줄만 가운데 정렬로 그린다.
export type TripDay = { key: string; top: string; bottom: string | null };

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const PRE_TRIP = 'pre-trip';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// YYYY-MM-DD → "10.20"
export function md(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${m}.${d}`;
}

// 기기 시간대와 무관하게 UTC로 날짜를 다룬다(feed.ts dateTitle과 같은 규칙).
const utc = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const DAY_MS = 24 * 60 * 60 * 1000;

type Args = { startDate: string | null; endDate: string | null; sectionKeys: string[] };

// 캘린더 칸: 전체 → (여행 전 지출이 있으면) 여행 전 → 기간의 각 날짜.
// 기간 밖 날짜의 지출은 '전체'에서만 보인다(groupFeed가 숨기지 않으므로 누락은 아니다).
export function buildTripDays({ startDate, endDate, sectionKeys }: Args): TripDay[] {
  const days: TripDay[] = [{ key: 'all', top: '전체', bottom: null }];
  if (sectionKeys.includes(PRE_TRIP)) days.push({ key: PRE_TRIP, top: '여행', bottom: '전' });
  if (!startDate) return days;
  const last = endDate && endDate >= startDate ? utc(endDate) : utc(startDate);
  for (let t = utc(startDate); t <= last; t += DAY_MS) {
    const key = iso(t);
    days.push({ key, top: WEEKDAYS[new Date(t).getUTCDay()], bottom: String(Number(key.slice(8))) });
  }
  return days;
}

// 섹션에 지출(활동 이벤트가 아닌 행)이 하나라도 있으면 true.
export function hasExpenseByDay<T>(sections: FeedSection<T>[]): Record<string, boolean> {
  return Object.fromEntries(
    sections.map((s) => [s.key, s.data.some((r) => !(typeof r === 'object' && r !== null && 'kind' in r))]),
  );
}

export function filterSections<T>(sections: FeedSection<T>[], day: string): FeedSection<T>[] {
  return day === 'all' ? sections : sections.filter((s) => s.key === day);
}

// 카테고리 필터가 켜지면 카테고리가 없는 활동 이벤트 행은 함께 빠진다. 비는 섹션은 통째로 뺀다.
export function filterByCategory<T>(sections: FeedSection<T>[], category: string | null): FeedSection<T>[] {
  if (!category) return sections;
  return sections
    .map((s) => ({
      ...s,
      data: s.data.filter(
        (r) => typeof r === 'object' && r !== null && !('kind' in r) && (r as { category?: unknown }).category === category,
      ),
    }))
    .filter((s) => s.data.length > 0);
}

export function dayCaption(day: string, startDate: string | null, endDate: string | null): string {
  if (day === PRE_TRIP) return '여행 전 지출';
  if (DATE_RE.test(day)) {
    const [, m, d] = day.split('-').map(Number);
    return `${m}월 ${d}일`;
  }
  if (!startDate) return '';
  return endDate ? `${md(startDate)} – ${md(endDate)}` : md(startDate);
}

export function monthLabel(day: string, startDate: string | null): string {
  const base = DATE_RE.test(day) ? day : startDate;
  if (!base) return '';
  const [y, m] = base.split('-').map(Number);
  return `${y}년 ${m}월`;
}
