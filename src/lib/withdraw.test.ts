import type { MyRoom } from '@/types/domain';

import { unsettledLines } from './withdraw';

const room = (name: string, myNet: number, status: MyRoom['status'] = 'shared'): MyRoom =>
  ({ roomId: name, name, baseCurrency: 'JPY', startDate: null, endDate: null, status, memberCount: 3, myNet, mySpent: 0, totalKrw: 0, hasBooking: false }) as MyRoom;

describe('unsettledLines', () => {
  it('순잔액이 남은 여행만 "여행명 · 보낼/받을 돈"으로 보여준다', () => {
    expect(unsettledLines([room('오사카·교토', -244920), room('제주', 0), room('방콕', 15000)])).toEqual([
      '오사카·교토 · 보낼 돈 244,920원',
      '방콕 · 받을 돈 15,000원',
    ]);
  });

  it('정산 완료된 여행은 빼고, 없으면 빈 배열', () => {
    expect(unsettledLines([room('끝난 여행', -1000, 'settled')])).toEqual([]);
    expect(unsettledLines([])).toEqual([]);
  });
});
