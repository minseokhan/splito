import { needsSettlement } from './roomList';
import type { MyRoom } from '@/types/domain';

const room = (over: Partial<MyRoom>): MyRoom => ({
  roomId: 'r1', name: '여행', baseCurrency: 'KRW', startDate: null, endDate: null,
  status: 'shared', memberCount: 2, myNet: 0, totalKrw: 0, hasBooking: false, ...over,
});

describe('needsSettlement', () => {
  it('정산 완료는 잔액과 무관하게 제외', () => {
    expect(needsSettlement(room({ status: 'settled', myNet: -1000 }))).toBe(false);
  });
  it('내 잔액이 0이면 정산할 게 없다', () => {
    expect(needsSettlement(room({ status: 'shared', myNet: 0 }))).toBe(false);
  });
  it('받을 돈도 줄 돈도 정산 대상', () => {
    expect(needsSettlement(room({ status: 'settling', myNet: 5000 }))).toBe(true);
    expect(needsSettlement(room({ status: 'shared', myNet: -5000 }))).toBe(true);
  });
  it('혼자 쓰는 방도 잔액이 있으면 대상', () => {
    expect(needsSettlement(room({ status: 'solo', myNet: 300 }))).toBe(true);
  });
});
