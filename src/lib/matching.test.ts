import type { BalanceRow } from '../types/domain';
import { matchTransfers } from './matching';

function row(memberId: string, net: number, over: Partial<BalanceRow> = {}): BalanceRow {
  return {
    memberId,
    kind: 'user',
    representativeMemberId: null,
    joinedAt: '2026-10-20T00:00:00Z',
    leftAt: null,
    paid: 0,
    owed: 0,
    net,
    ...over,
  };
}

// 시드 고정 PRNG(mulberry32)
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('matchTransfers', () => {
  it('PRD F7 예시 1: D→A 30만, C→B 10만', () => {
    const rows = [row('A', 300000), row('B', 100000), row('C', -100000), row('D', -300000)];
    expect(matchTransfers(rows)).toEqual([
      { from: 'D', to: 'A', amount: 300000 },
      { from: 'C', to: 'B', amount: 100000 },
    ]);
  });

  it('PRD F7 예시 2(공금 상계): B→A 10.5만, C→A 0.5만, D→A 0.5만', () => {
    const rows = [
      row('A', 115000, { joinedAt: '2026-10-20T00:00:00Z' }),
      row('B', -105000, { joinedAt: '2026-10-20T00:00:01Z' }),
      row('C', -5000, { joinedAt: '2026-10-20T00:00:02Z' }),
      row('D', -5000, { joinedAt: '2026-10-20T00:00:03Z' }),
    ];
    expect(matchTransfers(rows)).toEqual([
      { from: 'B', to: 'A', amount: 105000 },
      { from: 'C', to: 'A', amount: 5000 },
      { from: 'D', to: 'A', amount: 5000 },
    ]);
  });

  it('동점이면 joinedAt → memberId 순', () => {
    const rows = [
      row('z', -100, { joinedAt: '2026-10-20T00:00:00Z' }),
      row('a', -100, { joinedAt: '2026-10-21T00:00:00Z' }),
      row('b', -100, { joinedAt: '2026-10-20T00:00:00Z' }),
      row('c', 300),
    ];
    expect(matchTransfers(rows).map((t) => t.from)).toEqual(['b', 'z', 'a']);
  });

  it('모두 0이거나 1명 방이면 빈 배열', () => {
    expect(matchTransfers([row('A', 0), row('B', 0)])).toEqual([]);
    expect(matchTransfers([row('A', 0)])).toEqual([]);
    expect(matchTransfers([])).toEqual([]);
  });

  it('게스트 행(net 0)은 결과에 나오지 않는다', () => {
    const rows = [
      row('A', 5000),
      row('B', -5000),
      row('G', 0, { kind: 'guest', representativeMemberId: 'B', paid: 10000, owed: 3000 }),
    ];
    const result = matchTransfers(rows);
    expect(result).toEqual([{ from: 'B', to: 'A', amount: 5000 }]);
    expect(result.some((t) => t.from === 'G' || t.to === 'G')).toBe(false);
  });

  it('Σnet ≠ 0이면 throw', () => {
    expect(() => matchTransfers([row('A', 100), row('B', -99)])).toThrow();
  });

  it('속성: 무작위 방 500개', () => {
    const rand = mulberry32(20261030);
    for (let n = 0; n < 500; n++) {
      const size = 2 + Math.floor(rand() * 9);
      const rows: BalanceRow[] = [];
      let sum = 0;
      for (let i = 0; i < size - 1; i++) {
        const net = rand() < 0.2 ? 0 : Math.floor(rand() * 2000001) - 1000000;
        sum += net;
        rows.push(row(`m${i}`, net, { joinedAt: `2026-10-${10 + Math.floor(rand() * 5)}T00:00:00Z` }));
      }
      rows.push(row(`m${size - 1}`, -sum));

      const result = matchTransfers(rows);
      const nonZero = rows.filter((r) => r.net !== 0).length;
      expect(result.length).toBeLessThanOrEqual(Math.max(nonZero - 1, 0));

      const left = new Map(rows.map((r) => [r.memberId, r.net]));
      for (const t of result) {
        expect(Number.isInteger(t.amount)).toBe(true);
        expect(t.amount).toBeGreaterThan(0);
        left.set(t.from, left.get(t.from)! + t.amount);
        left.set(t.to, left.get(t.to)! - t.amount);
      }
      expect([...left.values()].every((v) => v === 0)).toBe(true);

      const shuffled = [...rows];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      expect(matchTransfers(shuffled)).toEqual(result);
    }
  });
});
