import type { MyRoom } from '@/types/domain';

// 홈 카드와 '정산할 곳' 드롭다운이 같은 집합을 보여야 한다 — 기준은 여기 하나뿐이다.
// 정산이 끝난 방(settled)은 뺀다. 그 외에는 주고받을 돈이 남았거나, 여행이 아직 안 끝났으면 보여준다 —
// 지출을 한 건도 안 올린 다가오는 여행이 목록에서 사라지면 안 된다.
export function isActiveTrip(r: MyRoom, today: string): boolean {
  if (r.status === 'settled') return false;
  if (r.myNet !== 0) return true;
  // 종료일이 없으면 시작일로, 둘 다 없으면 끝났다고 볼 수 없다.
  const end = r.endDate ?? r.startDate;
  return !end || end >= today;
}
