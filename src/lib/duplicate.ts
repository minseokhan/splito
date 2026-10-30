// 확인 화면의 중복 의심 배너용(PRD F4). 제안만 하고 합치지는 않는다.
import { formatForeign } from './money';

export type DupCandidate = {
  id: string;
  merchant: string | null;
  paidLocalDate: string;
  paidLocalTime: string | null;
  currency: string;
  amountOriginal: number;
  krwAmount: number | null;
  createdAt: string;
};

const WINDOW_MS = 72 * 3600_000;
const TIME_MS = 2 * 3600_000;

// NFKC가 전각 → 반각을 맡는다.
export function normalizeMerchant(s: string | null): string {
  return (s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

export function merchantSimilarity(a: string | null, b: string | null): number {
  const x = normalizeMerchant(a);
  const y = normalizeMerchant(b);
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return 1;
  const bx = bigrams(x);
  const by = bigrams(y);
  if (bx.length === 0 || by.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const g of by) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of bx) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (bx.length + by.length);
}

// 같은 통화면 원본, 다르면 둘 다 있을 때만 원화. draft 기준 상대 차이(0~0.2), 기준 밖이면 null.
function amountDiff(draft: Omit<DupCandidate, 'id' | 'createdAt'>, c: DupCandidate): number | null {
  const [a, b] =
    draft.currency === c.currency ? [draft.amountOriginal, c.amountOriginal] : [draft.krwAmount, c.krwAmount];
  if (a == null || b == null || a <= 0) return null;
  const d = Math.abs(a - b);
  return d * 5 <= a ? d / a : null;
}

function sameMoment(dDate: string, dTime: string | null, cDate: string, cTime: string | null): boolean {
  if (dTime && cTime) {
    return Math.abs(Date.parse(`${dDate}T${dTime}Z`) - Date.parse(`${cDate}T${cTime}Z`)) <= TIME_MS;
  }
  return dDate === cDate;
}

export function findDuplicate(
  draft: Omit<DupCandidate, 'id' | 'createdAt'>,
  recent: DupCandidate[],
  now: Date,
): DupCandidate | null {
  let best: DupCandidate | null = null;
  let bestScore = -Infinity;
  for (const c of recent) {
    if (now.getTime() - Date.parse(c.createdAt) > WINDOW_MS) continue;
    const diff = amountDiff(draft, c);
    if (diff === null) continue;
    if (!sameMoment(draft.paidLocalDate, draft.paidLocalTime, c.paidLocalDate, c.paidLocalTime)) continue;
    const sim = merchantSimilarity(draft.merchant, c.merchant);
    if (sim < 0.5) continue;
    const score = sim - diff;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

// 배너 문구: "어제 18:42 이치란 ¥3,280". todayLocal 기준 오늘·어제, 그 외 M/D.
export function describeDuplicate(c: DupCandidate, todayLocal: string): string {
  const days = Math.round((Date.parse(`${todayLocal}T00:00:00Z`) - Date.parse(`${c.paidLocalDate}T00:00:00Z`)) / 86_400_000);
  const [, m, d] = c.paidLocalDate.split('-');
  const day = days === 0 ? '오늘' : days === 1 ? '어제' : `${Number(m)}/${Number(d)}`;
  return [day, c.paidLocalTime?.slice(0, 5), c.merchant, formatForeign(c.amountOriginal, c.currency)].filter(Boolean).join(' ');
}
