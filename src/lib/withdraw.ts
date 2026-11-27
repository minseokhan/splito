import type { MyRoom } from '@/types/domain';

import { formatKrw } from './money';

// 회원 탈퇴 확인 시트(노션 26번)의 '정산이 남은 여행' 줄. 정산 완료가 아니고 순잔액이 0이 아닌 방만.
export function unsettledLines(rooms: MyRoom[]): string[] {
  return rooms
    .filter((r) => r.status !== 'settled' && r.myNet !== 0)
    .map((r) => `${r.name} · ${r.myNet < 0 ? '보낼 돈' : '받을 돈'} ${formatKrw(Math.abs(r.myNet))}`);
}
