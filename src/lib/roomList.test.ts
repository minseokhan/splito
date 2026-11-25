import { dDay, homeTrips, isActiveTrip, tripPhase } from './roomList';
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

// 노션 29번 홈 여행 카드: 상태 판정 → 카드·제목·내 여행 목록.
describe('tripPhase', () => {
  it('시작 전이면 upcoming, 기간 안이면 live', () => {
    expect(tripPhase(room({ startDate: '2026-12-02', endDate: '2026-12-05' }), TODAY)).toBe('upcoming');
    expect(tripPhase(room({ startDate: '2026-11-01', endDate: '2026-11-04' }), TODAY)).toBe('live');
  });
  it('끝났는데 정산이 남으면 settle, 다 끝났으면 done', () => {
    expect(tripPhase(room({ ...past, myNet: -1000 }), TODAY)).toBe('settle');
    expect(tripPhase(room({ ...past, status: 'settling', myNet: 3000 }), TODAY)).toBe('settle');
    expect(tripPhase(room({ ...past, status: 'settled' }), TODAY)).toBe('done');
  });
  it('기간 없는 여행은 정산 전이면 live', () => {
    expect(tripPhase(room({}), TODAY)).toBe('live');
    expect(tripPhase(room({ status: 'settled' }), TODAY)).toBe('done');
  });
});

describe('homeTrips', () => {
  const live1 = room({ roomId: 'live1', startDate: '2026-11-01', endDate: '2026-11-06' });
  const live2 = room({ roomId: 'live2', startDate: '2026-11-03', endDate: '2026-11-04' });
  const soon = room({ roomId: 'soon', startDate: '2026-12-02', endDate: '2026-12-05' });
  const later = room({ roomId: 'later', startDate: '2026-12-10', endDate: '2026-12-12' });
  const owe = room({ roomId: 'owe', ...past, myNet: -5000 });
  const done = room({ roomId: 'done', ...past, status: 'settled' });

  it('진행 중이 있으면 진행 중 전부가 카드, 나머지는 목록', () => {
    const h = homeTrips([soon, live1, done, live2], TODAY);
    expect(h.kind).toBe('live');
    expect(h.cards.map((r) => r.roomId)).toEqual(['live1', 'live2']);
    expect(h.title).toEqual(['진행 중인 여행이', '2개 있어요']);
    expect(h.others.map((r) => r.roomId)).toEqual(['soon', 'done']);
  });
  it('진행 중이 없으면 정산 남은 여행이 카드', () => {
    const h = homeTrips([soon, owe, done], TODAY);
    expect(h.kind).toBe('settle');
    expect(h.cards.map((r) => r.roomId)).toEqual(['owe']);
    expect(h.title).toEqual(['정산이 남은 여행이', '1개 있어요']);
  });
  it('예정만 있으면 가장 가까운 여행 하나가 카드, 제목은 예정 전체 개수', () => {
    const h = homeTrips([later, soon], TODAY);
    expect(h.kind).toBe('upcoming');
    expect(h.cards.map((r) => r.roomId)).toEqual(['soon']);
    expect(h.title).toEqual(['다가오는 여행이', '2개 있어요']);
    expect(h.others.map((r) => r.roomId)).toEqual(['later']);
  });
  it('지난 여행만 있으면 카드 없음', () => {
    const h = homeTrips([done], TODAY);
    expect(h.kind).toBeNull();
    expect(h.cards).toEqual([]);
    expect(h.others.map((r) => r.roomId)).toEqual(['done']);
  });
});

describe('dDay', () => {
  it('오늘부터 시작일까지 남은 날', () => {
    expect(dDay('2026-11-16', TODAY)).toBe('D-12');
    expect(dDay('2026-11-04', TODAY)).toBe('D-day');
  });
});
