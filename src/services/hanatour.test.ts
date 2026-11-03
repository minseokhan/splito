import { bookingPeriodLabel, lookupBooking } from './hanatour';

// 실제 API를 붙이면 이 파일의 분기 테스트는 통째로 버린다. 그때까지는 목업이 5종을 다 내는지가 유일한 보증이다.
describe('lookupBooking — 예약번호별 분기', () => {
  it('유효한 번호는 오사카·교토 4일 예약을 돌려준다', async () => {
    const r = await lookupBooking('HT2410-58213', '이민지');
    expect(r.kind).toBe('success');
    if (r.kind !== 'success') return;
    expect(r.booking.booking_no).toBe('HT2410-58213');
    expect(r.booking.pax).toBe(4);
    expect(r.booking.paid_amount).toBe(2_980_000);
    expect(r.booking.schedule).toHaveLength(13);
    expect(r.room).toEqual({ name: '오사카·교토 4일', baseCurrency: 'JPY' });
  });

  it('예약자 이름은 마스킹해서 담는다', async () => {
    const r = await lookupBooking('HT2410-58213', '이민지');
    expect(r.kind === 'success' && r.booking.holder_masked).toBe('이*지');
  });

  it.each([
    ['HT0000-00000', 'notFound'],
    ['HT9999-99999', 'canceled'],
    ['HT5555-55555', 'fail'],
  ])('%s → %s', async (no, kind) => {
    expect((await lookupBooking(no, '이민지')).kind).toBe(kind);
  });

  it('형식이 틀리거나 이름이 비면 조회하지 않는다', async () => {
    expect((await lookupBooking('HT2410-5821', '이민지')).kind).toBe('notFound');
    expect((await lookupBooking('HT2410-58213', '  ')).kind).toBe('notFound');
  });

  it('선택관광 2건에 예정 금액이 붙어 있다', async () => {
    const r = await lookupBooking('HT2410-58213', '이민지');
    if (r.kind !== 'success') throw new Error('성공이어야 한다');
    const optional = r.booking.schedule.filter((s) => s.optional);
    expect(optional.map((s) => [s.title, s.est_amount])).toEqual([
      ['익스프레스 패스 4', 180_000],
      ['기모노 체험', 45_000],
    ]);
  });
});

describe('bookingPeriodLabel', () => {
  it('요일과 박·일을 붙인다', () => {
    expect(bookingPeriodLabel({ start_date: '2025-10-20', end_date: '2025-10-23' })).toBe(
      '10.20(월) – 10.23(목) · 3박 4일',
    );
  });
});
