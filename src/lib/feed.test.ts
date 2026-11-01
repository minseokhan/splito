import { dateTitle, groupFeed, payerRecorderLabel, visibleToMe } from './feed';

const row = (id: string, paidLocalDate: string, createdAt: string) => ({ id, paidLocalDate, createdAt });

describe('groupFeed', () => {
  const rows = [
    row('a', '2026-10-20', '2026-10-20T01:00:00Z'), // 시작일 당일 → 여행 중
    row('b', '2026-10-19', '2026-10-19T01:00:00Z'), // 시작 전
    row('c', '2026-10-21', '2026-10-21T01:00:00Z'),
    row('d', '2026-10-21', '2026-10-21T05:00:00Z'),
    row('e', '2026-10-01', '2026-10-01T01:00:00Z'),
  ];

  it('결제일 내림차순, 같은 날은 created_at 내림차순, 시작 전은 맨 아래 "여행 전"', () => {
    const s = groupFeed(rows, '2026-10-20');
    expect(s.map((x) => x.title)).toEqual(['10월 21일 (수)', '10월 20일 (화)', '여행 전']);
    expect(s[0].data.map((r) => r.id)).toEqual(['d', 'c']);
    expect(s[1].data.map((r) => r.id)).toEqual(['a']);
    expect(s[2].key).toBe('pre-trip');
    expect(s[2].data.map((r) => r.id)).toEqual(['b', 'e']);
  });

  it('시작일 null이면 "여행 전" 없이 전부 날짜 그룹', () => {
    const s = groupFeed(rows, null);
    expect(s.map((x) => x.key)).toEqual(['2026-10-21', '2026-10-20', '2026-10-19', '2026-10-01']);
  });

  it('빈 목록', () => {
    expect(groupFeed([], '2026-10-20')).toEqual([]);
  });

  it('입력을 변경하지 않는다', () => {
    const copy = [...rows];
    groupFeed(rows, null);
    expect(rows).toEqual(copy);
  });
});

describe('dateTitle', () => {
  it('요일 표기', () => {
    expect(dateTitle('2026-10-21')).toBe('10월 21일 (수)');
    expect(dateTitle('2026-10-25')).toBe('10월 25일 (일)');
    expect(dateTitle('2026-01-03')).toBe('1월 3일 (토)');
  });
});

describe('payerRecorderLabel', () => {
  it('같으면 결제만, 다르면 기록자도', () => {
    expect(payerRecorderLabel('민지', '민지')).toBe('민지 결제');
    expect(payerRecorderLabel('민지', '지훈')).toBe('민지 결제 · 지훈 기록');
  });
});

describe('visibleToMe', () => {
  const rows = [
    { id: 'shared-mine', visibility: 'shared', createdBy: 'me' },
    { id: 'shared-other', visibility: 'shared', createdBy: 'other' },
    { id: 'private-mine', visibility: 'private', createdBy: 'me' },
    { id: 'private-other', visibility: 'private', createdBy: 'other' },
  ];

  it('남의 나만 보기만 빠지고 내 것은 남는다', () => {
    expect(visibleToMe(rows, 'me').map((r) => r.id)).toEqual(['shared-mine', 'shared-other', 'private-mine']);
  });

  it('로그인 전·작성자 불명이면 나만 보기는 전부 빠진다', () => {
    expect(visibleToMe(rows, undefined).map((r) => r.id)).toEqual(['shared-mine', 'shared-other']);
    expect(visibleToMe([{ id: 'x', visibility: 'private', createdBy: null }], 'me')).toEqual([]);
  });
});
