export type FeedSection<T> = { key: string; title: string; data: T[] };

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// isoDate는 YYYY-MM-DD 현지 날짜. 기기 시간대와 무관하게 UTC로 요일을 구한다.
export function dateTitle(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 (${WEEKDAYS[dow]})`;
}

// 방 시작일 이전 결제는 맨 아래 "여행 전" 섹션(시작일 당일은 여행 중). 기간 밖도 숨기지 않는다(PRD §8).
export function groupFeed<T extends { paidLocalDate: string; createdAt: string }>(
  rows: T[],
  roomStartDate: string | null,
): FeedSection<T>[] {
  const sorted = [...rows].sort(
    (a, b) => b.paidLocalDate.localeCompare(a.paidLocalDate) || b.createdAt.localeCompare(a.createdAt),
  );
  const sections: FeedSection<T>[] = [];
  const preTrip: T[] = [];
  for (const r of sorted) {
    if (roomStartDate && r.paidLocalDate < roomStartDate) {
      preTrip.push(r);
      continue;
    }
    const last = sections[sections.length - 1];
    if (last?.key === r.paidLocalDate) last.data.push(r);
    else sections.push({ key: r.paidLocalDate, title: dateTitle(r.paidLocalDate), data: [r] });
  }
  if (preTrip.length) sections.push({ key: 'pre-trip', title: '여행 전', data: preTrip });
  return sections;
}

export function payerRecorderLabel(payer: string, recorder: string): string {
  return payer === recorder ? `${payer} 결제` : `${payer} 결제 · ${recorder} 기록`;
}
