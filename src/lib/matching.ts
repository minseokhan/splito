// 서버 room_balances 결과 → 그리디 송금안(PRD §7.2, ARCHITECTURE §6.5). 순잔액은 다시 계산하지 않는다.
import type { BalanceRow, Krw, MemberId } from '../types/domain';

export type Transfer = { from: MemberId; to: MemberId; amount: Krw };

type Entry = { id: MemberId; joinedAt: string; left: Krw };

// 금액 큰 순 → joinedAt 오름차순 → memberId 사전순
function before(a: Entry, b: Entry): boolean {
  const da = Math.abs(a.left);
  const db = Math.abs(b.left);
  if (da !== db) return da > db;
  if (a.joinedAt !== b.joinedAt) return a.joinedAt < b.joinedAt;
  return a.id < b.id;
}

function pick(entries: Entry[], sign: 1 | -1): Entry | undefined {
  let best: Entry | undefined;
  for (const e of entries) {
    if (Math.sign(e.left) === sign && (!best || before(e, best))) best = e;
  }
  return best;
}

// 게스트는 net=0으로 대표자에 이미 합산되어 오므로 kind='user'만 매칭한다.
export function matchTransfers(rows: BalanceRow[]): Transfer[] {
  const entries: Entry[] = rows
    .filter((r) => r.kind === 'user')
    .map((r) => ({ id: r.memberId, joinedAt: r.joinedAt, left: r.net }));
  if (entries.reduce((s, e) => s + e.left, 0) !== 0) throw new Error('BALANCE_SUM_NOT_ZERO');

  const result: Transfer[] = [];
  for (;;) {
    const creditor = pick(entries, 1);
    const debtor = pick(entries, -1);
    if (!creditor || !debtor) return result;
    const amount = Math.min(creditor.left, -debtor.left);
    result.push({ from: debtor.id, to: creditor.id, amount });
    creditor.left -= amount;
    debtor.left += amount;
  }
}
