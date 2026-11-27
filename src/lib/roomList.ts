import type { MyRoom } from '@/types/domain';

// 홈 카드와 '정산할 곳' 드롭다운이 같은 집합을 보여야 한다 — 기준은 여기 하나뿐이다.
// 아직 안 끝난 여행은 **정산 상태와 무관하게** 진행 중이다. 시작도 안 한 여행은 당연히
// 주고받을 돈이 없어 'settled'로 잡히는데, 그걸 '마무리된 여행'으로 내리면 안 된다.
// 끝난 뒤에는 주고받을 돈이 남았는지로 가른다.
export function isActiveTrip(r: MyRoom, today: string): boolean {
  // 종료일이 없으면 시작일로 본다.
  const end = r.endDate ?? r.startDate;
  if (end) return end >= today || (r.status !== 'settled' && r.myNet !== 0);
  // 기간을 안 적은 여행은 끝났는지 알 수 없다 — 정산이 끝났을 때만 내린다.
  return r.status !== 'settled';
}

// ─── 홈 여행 카드(노션 29번) ───
// isActiveTrip을 넷으로 나눈 것: live·upcoming·settle = 진행 중 집합, done = 나머지.
export type TripPhase = 'live' | 'upcoming' | 'settle' | 'done';

export function tripPhase(r: MyRoom, today: string): TripPhase {
  if (!isActiveTrip(r, today)) return 'done';
  if (r.startDate && r.startDate > today) return 'upcoming';
  const end = r.endDate ?? r.startDate;
  return end && end < today ? 'settle' : 'live';
}

const HEAD: Record<Exclude<TripPhase, 'done'>, string> = {
  live: '진행 중인 여행이',
  settle: '정산이 남은 여행이',
  upcoming: '다가오는 여행이',
};
const RANK: Record<TripPhase, number> = { live: 0, settle: 1, upcoming: 2, done: 3 };

// 카드: 진행 중 전부 > (없으면) 정산 남은 여행 전부 > (없으면) 가장 가까운 예정 하나. 나머지는 '내 여행' 목록.
export function homeTrips(rooms: MyRoom[], today: string) {
  const withPhase = rooms.map((r) => ({ r, p: tripPhase(r, today) }));
  const of = (p: TripPhase) => withPhase.filter((x) => x.p === p).map((x) => x.r);
  const kind = (['live', 'settle', 'upcoming'] as const).find((p) => of(p).length > 0) ?? null;
  const all = kind ? of(kind) : [];
  const upcomingSorted = [...all].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  const cards = kind === 'upcoming' ? upcomingSorted.slice(0, 1) : all;
  const others = withPhase
    .filter((x) => !cards.includes(x.r))
    .sort((a, b) => RANK[a.p] - RANK[b.p] || (a.p === 'upcoming' ? (a.r.startDate ?? '').localeCompare(b.r.startDate ?? '') : 0))
    .map((x) => x.r);
  return { kind, cards, others, title: kind ? [HEAD[kind], `${all.length}개 있어요`] : null };
}

// 'D-12'. 당일은 'D-day'.
export function dDay(startDate: string, today: string): string {
  const n = Math.round((Date.parse(startDate) - Date.parse(today)) / 86_400_000);
  return n === 0 ? 'D-day' : `D-${n}`;
}
