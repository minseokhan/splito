import { commentSchema, eventText, mergeActivity, type RoomEvent } from './activity';

const ev = (p: Partial<RoomEvent>): RoomEvent => ({
  id: 'e1',
  kind: 'join',
  actorId: null,
  targetMemberId: null,
  payload: {},
  createdAt: '2026-10-21T03:00:00Z',
  ...p,
});

const names = { uJihun: '지훈', mMinji: '민지', mJihun: '지훈', gMom: '엄마' };

describe('eventText', () => {
  it.each<[Partial<RoomEvent>, string]>([
    [{ kind: 'join', targetMemberId: 'mMinji' }, '민지 님이 참여했어요'],
    [{ kind: 'leave', targetMemberId: 'mMinji' }, '민지 님이 방을 나갔어요'],
    [{ kind: 'removed', actorId: 'uJihun', targetMemberId: 'mMinji' }, '지훈 님이 민지 님을 내보냈어요'],
    [{ kind: 'guest_added', actorId: 'uJihun', targetMemberId: 'gMom' }, '지훈 님이 게스트 엄마 님을 추가했어요'],
    [
      { kind: 'guest_rep_change', targetMemberId: 'gMom', payload: { representative_member_id: 'mJihun' } },
      '엄마 님의 대표자가 지훈 님으로 바뀌었어요',
    ],
    [{ kind: 'owner_change', targetMemberId: 'mMinji' }, '방장이 민지 님으로 바뀌었어요'],
    [{ kind: 'pool_owner_change', targetMemberId: 'mMinji' }, '통장 주인이 민지 님으로 바뀌었어요'],
    [
      { kind: 'payout_reveal', actorId: 'uJihun', targetMemberId: 'mMinji' },
      '지훈 님이 정산을 위해 민지 님 계좌를 확인했어요',
    ],
    [
      { kind: 'payout_request', actorId: 'uJihun', targetMemberId: 'mMinji' },
      '지훈 님이 민지 님께 계좌 등록을 요청했어요',
    ],
    [
      { kind: 'transfer', payload: { from_member_id: 'mMinji', to_member_id: 'mJihun', amount_krw: 132000 } },
      '민지 → 지훈 132,000원 보냈어요',
    ],
  ])('%o', (p, text) => {
    expect(eventText(ev(p), names)).toBe(text);
  });

  it('target이 없으면 actor로 대신한다(join)', () => {
    expect(eventText(ev({ kind: 'join', actorId: 'uJihun' }), names)).toBe('지훈 님이 참여했어요');
  });

  it('이름을 모르거나 id가 null이면 "탈퇴한 사용자"', () => {
    expect(eventText(ev({ kind: 'payout_reveal', actorId: 'gone', targetMemberId: 'mMinji' }), names)).toBe(
      '탈퇴한 사용자 님이 정산을 위해 민지 님 계좌를 확인했어요',
    );
    expect(eventText(ev({ kind: 'owner_change' }), names)).toBe('방장이 탈퇴한 사용자 님으로 바뀌었어요');
    expect(eventText(ev({ kind: 'transfer', payload: { amount_krw: 1000 } }), names)).toBe(
      '탈퇴한 사용자 → 탈퇴한 사용자 1,000원 보냈어요',
    );
  });
});

describe('mergeActivity', () => {
  const x = (id: string, paidLocalDate: string, createdAt: string) => ({ id, paidLocalDate, createdAt });

  it('이벤트는 KST 날짜 섹션에, 섹션 안은 createdAt 내림차순', () => {
    const expenses = [x('a', '2026-10-21', '2026-10-21T01:00:00Z'), x('b', '2026-10-21', '2026-10-21T05:00:00Z')];
    const events = [
      ev({ id: 'e1', createdAt: '2026-10-21T03:00:00Z' }), // KST 10/21 12:00
      ev({ id: 'e2', createdAt: '2026-10-21T16:00:00Z' }), // KST 10/22 01:00
    ];
    const s = mergeActivity(expenses, events, '2026-10-20');
    expect(s.map((v) => v.key)).toEqual(['2026-10-22', '2026-10-21']);
    expect(s[0].data.map((r) => r.id)).toEqual(['e2']);
    expect(s[1].data.map((r) => r.id)).toEqual(['b', 'e1', 'a']);
    expect(s[1].data[1]).toBe(events[0]);
  });

  it('시작일 전 이벤트는 "여행 전"으로 간다', () => {
    const s = mergeActivity([], [ev({ createdAt: '2026-10-18T00:00:00Z' })], '2026-10-20');
    expect(s.map((v) => v.title)).toEqual(['여행 전']);
  });
});

describe('commentSchema', () => {
  it('trim 후 1~500자', () => {
    expect(commentSchema.safeParse('  ').success).toBe(false);
    expect(commentSchema.parse('  hi ')).toBe('hi');
    expect(commentSchema.safeParse('a'.repeat(500)).success).toBe(true);
    expect(commentSchema.safeParse('a'.repeat(501)).success).toBe(false);
  });
});
