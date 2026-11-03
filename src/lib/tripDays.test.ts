import type { FeedSection } from './feed';
import { buildTripDays, dayCaption, filterByCategory, filterSections, md, tripDayText } from './tripDays';

describe('buildTripDays', () => {
  it('전체 기간 + 여행 전 + 기간의 각 날짜, 날짜 칸은 N일차 · M.D', () => {
    const days = buildTripDays({ startDate: '2025-10-20', endDate: '2025-10-23', sectionKeys: ['pre-trip'] });
    expect(days).toEqual([
      { key: 'all', label: '전체 기간', sub: '10.20 – 10.23' },
      { key: 'pre-trip', label: '여행 전', sub: '' },
      { key: '2025-10-20', label: '1일차', sub: '10.20' },
      { key: '2025-10-21', label: '2일차', sub: '10.21' },
      { key: '2025-10-22', label: '3일차', sub: '10.22' },
      { key: '2025-10-23', label: '4일차', sub: '10.23' },
    ]);
  });

  it('여행 전 지출이 없으면 "여행 전" 칸을 만들지 않는다', () => {
    const days = buildTripDays({ startDate: '2025-10-20', endDate: '2025-10-21', sectionKeys: ['2025-10-20'] });
    expect(days.map((d) => d.key)).toEqual(['all', '2025-10-20', '2025-10-21']);
  });

  it('기간 미설정이면 전체 기간만, 기간 문구도 비운다', () => {
    expect(buildTripDays({ startDate: null, endDate: null, sectionKeys: ['2025-10-20'] })).toEqual([
      { key: 'all', label: '전체 기간', sub: '' },
    ]);
  });

  it('종료일이 없으면 시작일 하루만', () => {
    const days = buildTripDays({ startDate: '2025-10-20', endDate: null, sectionKeys: [] });
    expect(days.map((d) => d.key)).toEqual(['all', '2025-10-20']);
    expect(days[0].sub).toBe('10.20');
  });

  it('종료일이 시작일보다 앞서면 시작일 하루만', () => {
    expect(
      buildTripDays({ startDate: '2025-10-20', endDate: '2025-10-18', sectionKeys: [] }).map((d) => d.key),
    ).toEqual(['all', '2025-10-20']);
  });

  it('달과 해를 넘어가도 이어서 만든다', () => {
    const days = buildTripDays({ startDate: '2025-12-30', endDate: '2026-01-02', sectionKeys: [] });
    expect(days.map((d) => d.key)).toEqual(['all', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
    expect(days.map((d) => d.label)).toEqual(['전체 기간', '1일차', '2일차', '3일차', '4일차']);
    expect(days.map((d) => d.sub)).toEqual(['12.30 – 1.2', '12.30', '12.31', '1.1', '1.2']);
  });

  it('30일 여행도 전부 만든다', () => {
    expect(buildTripDays({ startDate: '2025-10-01', endDate: '2025-10-30', sectionKeys: [] })).toHaveLength(31);
  });
});

describe('tripDayText', () => {
  it('날짜가 있으면 가운뎃점으로 잇고, 없으면 라벨만', () => {
    expect(tripDayText({ key: 'all', label: '전체 기간', sub: '10.20 – 10.23' })).toBe('전체 기간 · 10.20 – 10.23');
    expect(tripDayText({ key: 'pre-trip', label: '여행 전', sub: '' })).toBe('여행 전');
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

describe('md', () => {
  it('YYYY-MM-DD → M.D', () => {
    expect(md('2025-10-20')).toBe('10.20');
    expect(md('2026-01-02')).toBe('1.2');
  });
});
