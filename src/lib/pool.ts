// 공금 지갑 표시·입력 보조. 공금 상계 자체는 서버 room_balances가 반영한다(여기서 순잔액을 바꾸지 않는다).
import type { ExpenseDraft } from './expenseForm';
import { formatKrw } from './money';

// 인식된 카드 끝자리가 공금 카드 목록과 일치하면 결제자를 pool로. 공금이 꺼져 있거나 불일치면 그대로.
export function autoSelectPayer(draft: ExpenseDraft, pool: { enabled: boolean; cardLast4: string[] }): ExpenseDraft {
  if (!pool.enabled || draft.cardLast4 === null || !pool.cardLast4.includes(draft.cardLast4)) return draft;
  return { ...draft, payerKind: 'pool', payerMemberId: null };
}

// 설명 문구 전용. 0이면 null.
export function poolNote(remainingKrw: number, ownerName: string): string | null {
  if (remainingKrw > 0) return `남은 공금 ${formatKrw(remainingKrw)}은 ${ownerName} 님이 돌려줄 금액에 포함됐어요`;
  if (remainingKrw < 0) return `부족한 공금 ${formatKrw(-remainingKrw)}은 ${ownerName} 님이 받을 금액에 포함됐어요`;
  return null;
}

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

export function poolRemaining(depositsKrw: number[], poolSpentKrw: number[]): number {
  return sum(depositsKrw) - sum(poolSpentKrw);
}

// "같은 금액 일괄 입력": 모든 참여자에게 같은 금액
export function fillEqual(memberIds: string[], amountKrw: number): { memberId: string; amountKrw: number }[] {
  return memberIds.map((memberId) => ({ memberId, amountKrw }));
}

// 공금 잔액(원)보다 큰 금액을 공금으로 기록할 때. over = 잔액(0 이상 부분)을 넘는 만큼, after = 기록 후 잔액.
// 기록은 막지 않는다(마이너스 허용) — 경고 표시용.
export function poolShortage(balanceKrw: number, needKrw: number): { over: number; after: number } | null {
  if (needKrw <= balanceKrw) return null;
  return { over: needKrw - Math.max(0, balanceKrw), after: balanceKrw - needKrw };
}

// 부족분 1/N 분담. 1인 금액은 100 단위 올림.
export function refillPerPerson(shortKrw: number, n: number): number {
  if (shortKrw <= 0 || n <= 0) return 0;
  return Math.ceil(shortKrw / (n * 100)) * 100;
}

// 통화가 섞인 금액들의 원화 합계. 환율을 모르는 통화가 하나라도 있으면 null(경고를 띄우지 않는다).
export function sumKrw(
  parts: { amount: number; currency: string }[],
  toKrw: (amount: number, currency: string) => number | null,
): number | null {
  let total = 0;
  for (const p of parts) {
    const k = p.currency === 'KRW' ? p.amount : toKrw(p.amount, p.currency);
    if (k === null) return null;
    total += k;
  }
  return total;
}
