import { isActiveTrip } from './roomList';
import type { MyRoom } from '@/types/domain';

const TODAY = '2026-11-04';
const room = (over: Partial<MyRoom>): MyRoom => ({
  roomId: 'r1', name: '여행', baseCurrency: 'KRW', startDate: null, endDate: null,
  status: 'shared', memberCount: 2, myNet: 0, mySpent: 0, totalKrw: 0, hasBooking: false, ...over,
});
const past = { startDate: '2026-09-13', endDate: '2026-09-13' };

describe('isActiveTrip — 아직 안 끝났거나 정산할 게 남은 여행', () => {
  // 시작도 안 한 여행은 주고받을 돈이 없어 'settled'로 잡힌다. 날짜가 먼저다.
  it('아직 안 끝난 여행은 정산 상태와 무관하게 남긴다', () => {
    expect(isActiveTrip(room({ status: 'settled', endDate: '2099-01-01' }), TODAY)).toBe(true);
    expect(isActiveTrip(room({ status: 'settled', startDate: '2026-11-11', endDate: '2026-11-13' }), TODAY)).toBe(true);
    expect(isActiveTrip(room({ status: 'settled', endDate: TODAY }), TODAY)).toBe(true);
  });

  it('끝난 여행은 정산이 끝났으면 제외', () => {
    expect(isActiveTrip(room({ status: 'settled', myNet: -1000, ...past }), TODAY)).toBe(false);
    expect(isActiveTrip(room({ status: 'settled', ...past }), TODAY)).toBe(false);
  });

  it('받을 돈도 줄 돈도 대상 — 기간이 지났어도 남는다', () => {
    expect(isActiveTrip(room({ status: 'settling', myNet: 5000, ...past }), TODAY)).toBe(true);
    expect(isActiveTrip(room({ status: 'shared', myNet: -5000, ...past }), TODAY)).toBe(true);
  });

  it('혼자 쓰는 방도 잔액이 있으면 대상', () => {
    expect(isActiveTrip(room({ status: 'solo', myNet: 300, ...past }), TODAY)).toBe(true);
  });

  it('기간이 다 지났고 정산할 것도 없으면 제외', () => {
    expect(isActiveTrip(room({ myNet: 0, ...past }), TODAY)).toBe(false);
  });

  it('지출이 없어도 앞으로 갈 여행이면 보여준다', () => {
    expect(isActiveTrip(room({ myNet: 0, startDate: '2026-11-11', endDate: '2026-11-13' }), TODAY)).toBe(true);
  });

  it('여행 중(오늘이 마지막 날)이면 보여준다', () => {
    expect(isActiveTrip(room({ myNet: 0, startDate: '2026-11-01', endDate: TODAY }), TODAY)).toBe(true);
  });

  it('종료일이 없으면 시작일로 판단한다', () => {
    expect(isActiveTrip(room({ myNet: 0, startDate: '2026-11-11' }), TODAY)).toBe(true);
    expect(isActiveTrip(room({ myNet: 0, startDate: '2026-09-13' }), TODAY)).toBe(false);
  });

  it('기간을 안 정한 여행은 끝났다고 볼 수 없어 보여준다', () => {
    expect(isActiveTrip(room({ myNet: 0 }), TODAY)).toBe(true);
  });
});
