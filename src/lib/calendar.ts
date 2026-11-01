// 달력 바텀시트용 날짜 계산. 기기 시간대와 무관하게 UTC로 다룬다(tripDays.ts와 같은 규칙).
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const DAY_MS = 24 * 60 * 60 * 1000;

// 'YYYY-MM' → 그 달 1일의 UTC ms
const firstOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return Date.UTC(y, m - 1, 1);
};

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

// 일~토 7열 격자. 1일 앞과 마지막 날 뒤는 빈칸(null)으로 채워 길이가 7의 배수가 된다.
export function monthGrid(month: string): (string | null)[] {
  const first = firstOf(month);
  const next = firstOf(shiftMonth(month, 1));
  const cells: (string | null)[] = Array<null>(new Date(first).getUTCDay()).fill(null);
  for (let t = first; t < next; t += DAY_MS) cells.push(iso(t));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}년 ${m}월`;
}

// "2026년 10월 22일 (목)"
export function dateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return iso(Date.UTC(y, m - 1, d + n));
}
