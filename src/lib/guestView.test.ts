import type { BalanceRow } from '../types/domain';
import { guestShareNote, memberDisplayName, orderBalanceRows, repChangeWarning } from './guestView';

const row = (memberId: string, p: Partial<BalanceRow> = {}): BalanceRow => ({
  memberId,
  kind: 'user',
  representativeMemberId: null,
  joinedAt: '2026-10-21T00:00:00Z',
  leftAt: null,
  paid: 0,
  owed: 0,
  net: 0,
  ...p,
});
const guest = (id: string, rep: string) => row(id, { kind: 'guest', representativeMemberId: rep });
const names = { minji: '민지', jihun: '지훈', mom: '엄마', dad: '아빠' };

describe('memberDisplayName', () => {
  it('user는 이름 그대로', () => {
    expect(memberDisplayName(row('minji'), names)).toBe('민지');
  });
  it('게스트는 "엄마(게스트 · 대표 민지)"', () => {
    expect(memberDisplayName(guest('mom', 'minji'), names)).toBe('엄마(게스트 · 대표 민지)');
  });
  it('대표자가 나가도 names에 있는 이름을 유지한다', () => {
    const rows = [row('minji', { leftAt: '2026-10-25T00:00:00Z' }), guest('mom', 'minji')];
    expect(memberDisplayName(rows[1], names)).toBe('엄마(게스트 · 대표 민지)');
  });
});

describe('guestShareNote', () => {
  it('게스트 한 명', () => {
    expect(guestShareNote('minji', [row('minji'), guest('mom', 'minji')], names)).toBe('엄마 몫 포함');
  });
  it('게스트 여러 명은 가운뎃점으로 잇는다', () => {
    const rows = [row('minji'), guest('mom', 'minji'), guest('dad', 'minji'), row('jihun')];
    expect(guestShareNote('minji', rows, names)).toBe('엄마·아빠 몫 포함');
  });
  it('대표하는 게스트가 없으면 null', () => {
    expect(guestShareNote('jihun', [row('jihun'), guest('mom', 'minji')], names)).toBeNull();
  });
});

describe('repChangeWarning', () => {
  it('경고 문구', () => {
    expect(repChangeWarning('엄마', '지훈')).toBe('엄마의 정산 금액이 지훈 님에게 옮겨져요');
  });
});

describe('orderBalanceRows', () => {
  it('user 행 다음에 그 사람이 대표하는 게스트 행이 온다', () => {
    const rows = [guest('mom', 'jihun'), row('minji'), guest('dad', 'minji'), row('jihun')];
    expect(orderBalanceRows(rows).map((r) => r.memberId)).toEqual(['minji', 'dad', 'jihun', 'mom']);
  });
  it('대표자 행이 없는 게스트도 빠뜨리지 않고 끝에 둔다', () => {
    const rows = [guest('mom', 'ghost'), row('minji')];
    expect(orderBalanceRows(rows).map((r) => r.memberId)).toEqual(['minji', 'mom']);
  });
  it('net을 바꾸지 않는다(이중 합산 금지)', () => {
    const rows = [row('minji', { net: 500 }), guest('mom', 'minji')];
    expect(orderBalanceRows(rows).map((r) => r.net)).toEqual([500, 0]);
  });
});
