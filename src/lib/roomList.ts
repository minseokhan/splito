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
