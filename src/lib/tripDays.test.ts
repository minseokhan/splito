import type { FeedSection } from './feed';
import {
  buildTripDays,
  dayCaption,
  filterByCategory,
  filterSections,
  hasExpenseByDay,
  md,
  monthLabel,
} from './tripDays';

describe('buildTripDays', () => {
  it('전체 + 여행 전 + 기간의 각 날짜, 요일은 한글 1글자', () => {
    const days = buildTripDays({ startDate: '2025-10-20', endDate: '2025-10-23', sectionKeys: ['pre-trip'] });
    expect(days).toEqual([
      { key: 'all', top: '전체', bottom: null },
      { key: 'pre-trip', top: '여행', bottom: '전' },
      { key: '2025-10-20', top: '월', bottom: '20' },
      { key: '2025-10-21', top: '화', bottom: '21' },
      { key: '2025-10-22', top: '수', bottom: '22' },
      { key: '2025-10-23', top: '목', bottom: '23' },
    ]);
  });

  it('여행 전 지출이 없으면 "여행 전" 칸을 만들지 않는다', () => {
    const days = buildTripDays({ startDate: '2025-10-20', endDate: '2025-10-21', sectionKeys: ['2025-10-20'] });
    expect(days.map((d) => d.key)).toEqual(['all', '2025-10-20', '2025-10-21']);
  });

  it('기간 미설정이면 전체만', () => {
    expect(buildTripDays({ startDate: null, endDate: null, sectionKeys: ['2025-10-20'] })).toEqual([
      { key: 'all', top: '전체', bottom: null },
    ]);
  });

  it('종료일이 없으면 시작일 하루만', () => {
    expect(buildTripDays({ startDate: '2025-10-20', endDate: null, sectionKeys: [] }).map((d) => d.key)).toEqual([
      'all',
      '2025-10-20',
    ]);
  });

  it('종료일이 시작일보다 앞서면 시작일 하루만', () => {
    expect(
      buildTripDays({ startDate: '2025-10-20', endDate: '2025-10-18', sectionKeys: [] }).map((d) => d.key),
    ).toEqual(['all', '2025-10-20']);
  });

  it('달과 해를 넘어가도 이어서 만든다', () => {
    const days = buildTripDays({ startDate: '2025-12-30', endDate: '2026-01-02', sectionKeys: [] });
    expect(days.map((d) => d.key)).toEqual(['all', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
    expect(days.map((d) => d.bottom)).toEqual([null, '30', '31', '1', '2']);
  });

  it('30일 여행도 전부 만든다', () => {
    expect(buildTripDays({ startDate: '2025-10-01', endDate: '2025-10-30', sectionKeys: [] })).toHaveLength(31);
  });

  it('7일 여행은 전체 + 7칸(가로 스크롤 구간)', () => {
    const days = buildTripDays({ startDate: '2025-10-20', endDate: '2025-10-26', sectionKeys: [] });
    expect(days).toHaveLength(8);
    expect(days.map((d) => d.bottom)).toEqual([null, '20', '21', '22', '23', '24', '25', '26']);
  });
});

describe('hasExpenseByDay', () => {
  const section = (key: string, data: unknown[]) => ({ key, title: key, data }) as FeedSection<unknown>;

  it('지출이 하나라도 있는 섹션만 true', () => {
    const sections = [
      section('2025-10-21', [{ id: 'e1' }]),
      section('2025-10-22', [{ id: 'v1', kind: 'join' }]),
      section('pre-trip', [{ id: 'v2', kind: 'join' }, { id: 'e2' }]),
    ];
    expect(hasExpenseByDay(sections)).toEqual({ '2025-10-21': true, '2025-10-22': false, 'pre-trip': true });
  });
});

describe('filterSections', () => {
  const sections = [
    { key: '2025-10-21', title: '', data: [] },
    { key: 'pre-trip', title: '', data: [] },
  ];

  it('all이면 전부', () => {
    expect(filterSections(sections, 'all')).toEqual(sections);
  });

  it('그 키의 섹션만', () => {
    expect(filterSections(sections, 'pre-trip')).toEqual([sections[1]]);
    expect(filterSections(sections, '2025-10-20')).toEqual([]);
  });
});

describe('filterByCategory', () => {
  const section = (key: string, data: unknown[]) => ({ key, title: key, data }) as FeedSection<unknown>;
  const sections = [
    section('2025-10-21', [{ id: 'e1', category: 'food' }, { id: 'v1', kind: 'join' }, { id: 'e2', category: 'shopping' }]),
    section('2025-10-22', [{ id: 'v2', kind: 'join' }]),
  ];

  it('null이면 그대로', () => {
    expect(filterByCategory(sections, null)).toEqual(sections);
  });

  it('그 카테고리 지출만 남기고 활동 이벤트는 뺀다', () => {
    expect(filterByCategory(sections, 'food')).toEqual([
      { key: '2025-10-21', title: '2025-10-21', data: [{ id: 'e1', category: 'food' }] },
    ]);
  });

  it('비는 섹션은 통째로 뺀다', () => {
    expect(filterByCategory(sections, 'lodging')).toEqual([]);
  });
});

describe('dayCaption', () => {
  it('all이면 여행 기간', () => {
    expect(dayCaption('all', '2025-10-20', '2025-10-23')).toBe('10.20 – 10.23');
    expect(dayCaption('all', '2025-10-20', null)).toBe('10.20');
    expect(dayCaption('all', null, null)).toBe('');
  });

  it('여행 전 / 날짜', () => {
    expect(dayCaption('pre-trip', '2025-10-20', '2025-10-23')).toBe('여행 전 지출');
    expect(dayCaption('2025-10-21', '2025-10-20', '2025-10-23')).toBe('10월 21일');
  });
});

describe('monthLabel', () => {
  it('선택한 날짜의 연월, 날짜가 아니면 시작일 기준', () => {
    expect(monthLabel('2026-01-02', '2025-12-30')).toBe('2026년 1월');
    expect(monthLabel('all', '2025-12-30')).toBe('2025년 12월');
    expect(monthLabel('pre-trip', '2025-12-30')).toBe('2025년 12월');
    expect(monthLabel('all', null)).toBe('');
  });
});

describe('md', () => {
  it('YYYY-MM-DD → M.D', () => {
    expect(md('2025-10-20')).toBe('10.20');
    expect(md('2026-01-02')).toBe('1.2');
  });
});
