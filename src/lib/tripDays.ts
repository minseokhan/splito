import type { FeedSection } from './feed';

// 기간 선택 pill·드롭다운 한 칸. label='전체 기간'·'여행 전'·'N일차', sub=날짜(없으면 빈 문자열).
export type TripDay = { key: string; label: string; sub: string };

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

// 기간 메뉴: 전체 기간 → (여행 전 지출이 있으면) 여행 전 → 기간의 각 날짜.
// 기간 밖 날짜의 지출은 '전체 기간'에서만 보인다(groupFeed가 숨기지 않으므로 누락은 아니다).
export function buildTripDays({ startDate, endDate, sectionKeys }: Args): TripDay[] {
  const last = startDate && endDate && endDate >= startDate ? endDate : startDate;
  const days: TripDay[] = [
    {
      key: 'all',
      label: '전체 기간',
      sub: !startDate ? '' : last === startDate ? md(startDate) : `${md(startDate)} – ${md(last!)}`,
    },
  ];
  if (sectionKeys.includes(PRE_TRIP)) days.push({ key: PRE_TRIP, label: '여행 전', sub: '' });
  if (!startDate) return days;
  let n = 1;
  for (let t = utc(startDate); t <= utc(last!); t += DAY_MS, n += 1) {
    const key = iso(t);
    days.push({ key, label: `${n}일차`, sub: md(key) });
  }
  return days;
}

// pill과 메뉴 행에 쓰는 한 줄 문구. '전체 기간 · 10.20 – 10.23' / '여행 전'
export function tripDayText(day: TripDay): string {
  return day.sub ? `${day.label} · ${day.sub}` : day.label;
}

// 고른 기간을 문장으로 푼다. 내 통계 화면(my-stats)이 카드 캡션으로 쓴다.
export function dayCaption(day: string, startDate: string | null, endDate: string | null): string {
  if (day === PRE_TRIP) return '여행 전 지출';
  if (DATE_RE.test(day)) {
    const [, m, d] = day.split('-').map(Number);
    return `${m}월 ${d}일`;
  }
  if (!startDate) return '';
  return endDate ? `${md(startDate)} – ${md(endDate)}` : md(startDate);
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
