import { addDays, dateLabel, monthGrid, monthTitle, shiftMonth, WEEKDAYS } from './calendar';

describe('monthGrid', () => {
  it('일요일부터 시작하는 7열 격자, 1일 앞은 빈칸', () => {
    // 2026-10-01은 목요일 → 앞에 빈칸 4개(일·월·화·수)
    const g = monthGrid('2026-10');
    expect(g.slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']);
    expect(g.filter((c) => c !== null)).toHaveLength(31);
    // 빈칸 4 + 31일 = 35로 딱 5주라 뒤 빈칸이 없다
    expect(g).toHaveLength(35);
    expect(g[34]).toBe('2026-10-31');
  });

  it('마지막 날 뒤는 빈칸으로 채운다', () => {
    // 2026-11-01은 일요일, 30일까지 → 30 + 빈칸 5 = 35
    const g = monthGrid('2026-11');
    expect(g).toHaveLength(35);
    expect(g.slice(30)).toEqual([null, null, null, null, null]);
  });

  it('길이는 항상 7의 배수', () => {
    for (const m of ['2026-01', '2026-02', '2026-10', '2027-02', '2028-02']) {
      const g = monthGrid(m);
      expect(g.length % 7).toBe(0);
      expect(g.filter((c) => c === null).length + g.filter((c) => c !== null).length).toBe(g.length);
    }
  });

  it('윤년 2월은 29일까지', () => {
    expect(monthGrid('2028-02').filter((c) => c !== null)).toHaveLength(29);
    expect(monthGrid('2027-02').filter((c) => c !== null)).toHaveLength(28);
  });

  it('1일이 일요일이면 앞 빈칸이 없다', () => {
    // 2026-11-01은 일요일
    expect(monthGrid('2026-11')[0]).toBe('2026-11-01');
  });

  it('날짜는 모두 같은 달의 YYYY-MM-DD', () => {
    const g = monthGrid('2026-10').filter((c): c is string => c !== null);
    expect(g.every((d) => d.startsWith('2026-10') && /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect(g).toEqual([...g].sort());
  });
});

describe('shiftMonth', () => {
  it.each([
    ['2026-10', 1, '2026-11'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-10', -1, '2026-09'],
    ['2026-10', 0, '2026-10'],
  ])('%s %s → %s', (m, delta, want) => expect(shiftMonth(m, delta)).toBe(want));
});

describe('monthTitle · dateLabel · WEEKDAYS', () => {
  it('월 제목은 0을 떼고 보여준다', () => {
    expect(monthTitle('2026-01')).toBe('2026년 1월');
    expect(monthTitle('2026-10')).toBe('2026년 10월');
  });

  it('사람이 읽는 날짜 + 요일', () => {
    expect(dateLabel('2026-10-22')).toBe('2026년 10월 22일 (목)');
    expect(dateLabel('2026-11-01')).toBe('2026년 11월 1일 (일)');
  });

  it('요일 라벨은 일요일부터 7개', () => {
    expect(WEEKDAYS).toEqual(['일', '월', '화', '수', '목', '금', '토']);
  });
});

describe('addDays', () => {
  it('월·연 넘김도 UTC로 계산한다', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-22', 0)).toBe('2026-10-22');
  });
});
