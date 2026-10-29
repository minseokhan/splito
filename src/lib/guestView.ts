// 게스트 표기(PRD §7.2, UI_GUIDE 게스트 아바타). 게스트 net은 서버 room_balances가 이미 대표자에 합산했으므로 금액은 건드리지 않는다.
import type { BalanceRow, MemberId } from '../types/domain';

// "엄마(게스트 · 대표 민지)". 대표자가 나가도 names에 남아 있는 이름을 쓴다.
export function memberDisplayName(row: BalanceRow, names: Record<MemberId, string>): string {
  const name = names[row.memberId] ?? '';
  if (row.kind !== 'guest') return name;
  return `${name}(게스트 · 대표 ${names[row.representativeMemberId ?? ''] ?? ''})`;
}

// 대표자 송금 카드 보조 문구: "엄마 몫 포함" / "엄마·아빠 몫 포함"
export function guestShareNote(
  representativeId: MemberId,
  rows: BalanceRow[],
  names: Record<MemberId, string>,
): string | null {
  const guests = rows.filter((r) => r.kind === 'guest' && r.representativeMemberId === representativeId);
  if (guests.length === 0) return null;
  return `${guests.map((g) => names[g.memberId] ?? '').join('·')} 몫 포함`;
}

export function repChangeWarning(guestName: string, newRepName: string): string {
  return `${guestName}의 정산 금액이 ${newRepName} 님에게 옮겨져요`;
}

// user 행(입력 순서 유지) 바로 뒤에 그가 대표하는 게스트. 대표자 행이 없는 게스트는 끝에 둔다.
export function orderBalanceRows(rows: BalanceRow[]): BalanceRow[] {
  const users = rows.filter((r) => r.kind === 'user');
  const guests = rows.filter((r) => r.kind === 'guest');
  const userIds = new Set(users.map((u) => u.memberId));
  return [
    ...users.flatMap((u) => [u, ...guests.filter((g) => g.representativeMemberId === u.memberId)]),
    ...guests.filter((g) => !userIds.has(g.representativeMemberId ?? '')),
  ];
}
