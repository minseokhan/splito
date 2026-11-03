import {
  buildScheduleDays,
  dayIndexOfDate,
  dayKeyOfIndex,
  isValidScheduleTime,
  normalizeScheduleTime,
  type ScheduleItem,
} from './schedule';

const START = '2025-10-20';
const END = '2025-10-23';

const item = (over: Partial<ScheduleItem> & { id: string; dayIndex: number; startTime: string }): ScheduleItem => ({
  title: '일정',
  includes: [],
  excludes: [],
  optional: false,
  estAmount: 0,
  edited: false,
  ...over,
});

const exp = (id: string, paidLocalDate: string, krwAmount: number | null, scheduleId: string | null = null) => ({
  id,
  paidLocalDate,
  krwAmount,
  scheduleId,
});

describe('normalizeScheduleTime / isValidScheduleTime', () => {
  it('한 자리 시를 0으로 채운다', () => {
    expect(normalizeScheduleTime('9:30')).toBe('09:30');
  });
  it('이미 두 자리면 그대로 둔다', () => {
    expect(normalizeScheduleTime('09:30')).toBe('09:30');
  });
  it.each(['0:00', '9:30', '23:59'])('%s는 유효하다', (v) => {
    expect(isValidScheduleTime(v)).toBe(true);
  });
  it.each(['', '24:00', '9:60', '930', '9:3', 'ab:cd'])('%s는 유효하지 않다', (v) => {
    expect(isValidScheduleTime(v)).toBe(false);
  });
});

describe('dayKeyOfIndex', () => {
  it('0일차는 여행 전', () => {
    expect(dayKeyOfIndex(0, START)).toBe('pre-trip');
  });
  it('1일차는 시작일', () => {
    expect(dayKeyOfIndex(1, START)).toBe('2025-10-20');
  });
  it('4일차는 시작일 +3', () => {
    expect(dayKeyOfIndex(4, START)).toBe('2025-10-23');
  });
  it('시작일이 없으면 여행 전으로 접는다', () => {
    expect(dayKeyOfIndex(2, null)).toBe('pre-trip');
  });
});

describe('dayIndexOfDate', () => {
  it('기간 안의 날짜는 해당 일차', () => {
    expect(dayIndexOfDate('2025-10-21', START, END)).toBe(2);
  });
  it('시작일 이전은 여행 전', () => {
    expect(dayIndexOfDate('2025-10-19', START, END)).toBe(0);
  });
  it('종료일 이후도 여행 전으로 접는다(명세 §7)', () => {
    expect(dayIndexOfDate('2025-10-24', START, END)).toBe(0);
  });
  it('기간이 없으면 여행 전', () => {
    expect(dayIndexOfDate('2025-10-21', null, null)).toBe(0);
  });
});

describe('buildScheduleDays', () => {
  const items = [
    item({ id: 's12', dayIndex: 1, startTime: '13:00', title: '오사카성 공원' }),
    item({ id: 's11', dayIndex: 1, startTime: '09:30', title: '인천 → 간사이' }),
    item({ id: 's23', dayIndex: 2, startTime: '11:00', title: '익스프레스 패스 4', optional: true, estAmount: 180_000 }),
  ];

  it('일차별로 묶고 시간순으로 정렬한다', () => {
    const days = buildScheduleDays({ items, expenses: [], hiddenIds: [], startDate: START, endDate: END });
    const day1 = days.find((d) => d.dayIndex === 1)!;
    expect(day1.cards.map((c) => c.item.title)).toEqual(['인천 → 간사이', '오사카성 공원']);
  });

  it('여행 기간만큼 일차 칸을 만든다(일정이 없는 날도)', () => {
    const days = buildScheduleDays({ items, expenses: [], hiddenIds: [], startDate: START, endDate: END });
    expect(days.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('일차 소제목에 날짜와 대표 일정을 붙인다', () => {
    const days = buildScheduleDays({ items, expenses: [], hiddenIds: [], startDate: START, endDate: END });
    expect(days.find((d) => d.dayIndex === 1)!.header).toBe('1일차 · 10.20 (월) · 인천 → 간사이');
    expect(days.find((d) => d.dayIndex === 0)!.header).toBe('여행 전');
    expect(days.find((d) => d.dayIndex === 3)!.header).toBe('3일차 · 10.22 (수)');
  });

  it('연결된 지출은 그 카드에 들어가고 합계는 결제 총액이다', () => {
    const days = buildScheduleDays({
      items,
      expenses: [exp('e1', '2025-10-20', 81_000, 's12'), exp('e2', '2025-10-20', 19_000, 's12')],
      hiddenIds: [],
      startDate: START,
      endDate: END,
    });
    const card = days.find((d) => d.dayIndex === 1)!.cards.find((c) => c.item.id === 's12')!;
    expect(card.expenses.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(card.sum).toBe(100_000);
  });

  it('일정에 연결되지 않은 지출은 결제일의 그 외 지출로 간다', () => {
    const days = buildScheduleDays({
      items,
      expenses: [exp('e3', '2025-10-21', 114_680)],
      hiddenIds: [],
      startDate: START,
      endDate: END,
    });
    const day2 = days.find((d) => d.dayIndex === 2)!;
    expect(day2.extra.map((e) => e.id)).toEqual(['e3']);
    expect(day2.extraSum).toBe(114_680);
    expect(day2.extraLabel).toBe('그 외 지출');
  });

  it('여행 전 지출은 여행 전 칸에 모이고 이름이 다르다', () => {
    const days = buildScheduleDays({
      items,
      expenses: [exp('e0', '2025-10-02', 2_980_000)],
      hiddenIds: [],
      startDate: START,
      endDate: END,
    });
    const pre = days.find((d) => d.dayIndex === 0)!;
    expect(pre.extra.map((e) => e.id)).toEqual(['e0']);
    expect(pre.extraLabel).toBe('여행 전 지출');
  });

  it('환율 대기(krwAmount=null) 지출은 합계를 0으로 센다', () => {
    const days = buildScheduleDays({
      items,
      expenses: [exp('e4', '2025-10-20', null, 's12')],
      hiddenIds: [],
      startDate: START,
      endDate: END,
    });
    expect(days.find((d) => d.dayIndex === 1)!.cards.find((c) => c.item.id === 's12')!.sum).toBe(0);
  });

  it('지출이 없는 선택관광만 예정 금액을 보여준다', () => {
    const days = buildScheduleDays({ items, expenses: [], hiddenIds: [], startDate: START, endDate: END });
    expect(days.find((d) => d.dayIndex === 2)!.cards[0].showEst).toBe(true);
  });

  it('지출을 연결하면 예정 표시가 사라진다', () => {
    const days = buildScheduleDays({
      items,
      expenses: [exp('e5', '2025-10-21', 150_000, 's23')],
      hiddenIds: [],
      startDate: START,
      endDate: END,
    });
    expect(days.find((d) => d.dayIndex === 2)!.cards[0].showEst).toBe(false);
  });

  it('숨긴 선택관광은 카드에서 빠지고 개수만 센다', () => {
    const days = buildScheduleDays({ items, expenses: [], hiddenIds: ['s23'], startDate: START, endDate: END });
    const day2 = days.find((d) => d.dayIndex === 2)!;
    expect(day2.cards).toHaveLength(0);
    expect(day2.hiddenCount).toBe(1);
  });

  it('지출이 연결된 선택관광은 숨겨도 보인다', () => {
    const days = buildScheduleDays({
      items,
      expenses: [exp('e6', '2025-10-21', 150_000, 's23')],
      hiddenIds: ['s23'],
      startDate: START,
      endDate: END,
    });
    const day2 = days.find((d) => d.dayIndex === 2)!;
    expect(day2.cards).toHaveLength(1);
    expect(day2.hiddenCount).toBe(0);
  });

  it('사라진 일정을 가리키는 지출도 결제일의 그 외 지출로 떨어진다', () => {
    const days = buildScheduleDays({
      items,
      expenses: [exp('e7', '2025-10-20', 5_000, 'gone')],
      hiddenIds: [],
      startDate: START,
      endDate: END,
    });
    expect(days.find((d) => d.dayIndex === 1)!.extra.map((e) => e.id)).toEqual(['e7']);
  });

  it('기간을 넘는 일차가 있으면 그 칸까지 만든다', () => {
    const days = buildScheduleDays({
      items: [item({ id: 's61', dayIndex: 6, startTime: '10:00' })],
      expenses: [],
      hiddenIds: [],
      startDate: START,
      endDate: END,
    });
    expect(days[days.length - 1].dayIndex).toBe(6);
  });

  it('기간이 없으면 여행 전 칸만 만든다', () => {
    const days = buildScheduleDays({
      items: [],
      expenses: [exp('e8', '2025-10-20', 1_000)],
      hiddenIds: [],
      startDate: null,
      endDate: null,
    });
    expect(days.map((d) => d.dayIndex)).toEqual([0]);
    expect(days[0].extra.map((e) => e.id)).toEqual(['e8']);
  });
});
