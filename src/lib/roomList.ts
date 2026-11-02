import type { MyRoom } from '@/types/domain';

// 홈 카드와 '정산할 곳' 드롭다운이 같은 집합을 보여야 한다 — 기준은 여기 하나뿐이다.
// 정산이 끝났거나(settled) 내가 주고받을 돈이 없는 방은 '정산 중'이 아니다.
export function needsSettlement(r: MyRoom): boolean {
  return r.status !== 'settled' && r.myNet !== 0;
}
