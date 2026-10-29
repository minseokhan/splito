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
