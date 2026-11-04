// '이 자리 정산' 표시 로직. 금액의 정답은 서버(room_balances)이고 여기는 미리보기다(ADR-006).
// 다만 시트가 보여주는 1인 금액은 장부가 실제로 잡을 분담액과 **같은 값**이어야 한다 —
// 그래서 room_balances·my_expense_shares와 같은 규칙을 쓴다: 박스마다 floor(박스원화 / 인원),
// 자투리(항상 ≥ 0)는 결제자가 진다. 핸드오프 README의 round(sum/n, 10원)은 쓰지 않는다.
import { formatKrw, splitEvenly } from './money';

export type SpotExpense = {
  id: string;
  payerMemberId: string;
  merchant: string;
  krwAmount: number;
  /** expense_items의 원화. 원화 미확정이면 빈 배열 */
  boxes: number[];
  currency: string;
  amountOriginal: number;
};

// 서버 _spot_payload의 participants와 같은 모양으로 둔다 — 중간 변환을 만들지 않는다.
export type SpotParticipant = {
  memberId: string;
  isQr: boolean;
  /** 결제자가 '받았어요'로 확인해 송금이 기록된 상태. 확정 기준은 이쪽이다 */
  confirmed: boolean;
};

export type SpotTotals = {
  sum: number;
  /** 결제자가 아닌 한 사람의 몫 */
  share: number;
  /** 결제자의 몫 = share + 자투리 전부 */
  payerShare: number;
};

export function spotTotals(expenses: SpotExpense[], people: number): SpotTotals {
  const sum = expenses.reduce((s, e) => s + e.krwAmount, 0);
  if (people <= 0) return { sum, share: 0, payerShare: sum };

  let share = 0;
  let remainder = 0;
  for (const e of expenses) {
    for (const box of e.boxes) {
      const split = splitEvenly(box, people);
      share += split.perPerson;
      remainder += split.remainder;
    }
  }
  return { sum, share, payerShare: share + remainder };
}

type Selection = { selected: string[]; payerMemberId: string };

// 지출 체크 토글. 한 번의 정산은 결제자가 한 명이라(README §2-2),
// 결제자가 다른 지출을 고르면 선택을 그 하나로 바꾼다.
export function nextExpenseSelection(
  expenses: SpotExpense[],
  selected: string[],
  toggled: string,
): Selection | { error: 'LAST_EXPENSE' } {
  const order = new Map(expenses.map((e, i) => [e.id, i]));
  const payerOf = (ids: string[]) => expenses.find((e) => e.id === ids[0])?.payerMemberId ?? '';
  const keep = { selected, payerMemberId: payerOf(selected) };

  const target = expenses.find((e) => e.id === toggled);
  if (!target) return keep;

  if (selected.includes(toggled)) {
    if (selected.length === 1) return { error: 'LAST_EXPENSE' };
    const next = selected.filter((id) => id !== toggled);
    return { selected: next, payerMemberId: payerOf(next) };
  }
  if (target.payerMemberId !== keep.payerMemberId) {
    return { selected: [toggled], payerMemberId: target.payerMemberId };
  }
  const next = [...selected, toggled].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { selected: next, payerMemberId: target.payerMemberId };
}

// QR로 들어온 사람만 결제자에게 직접 송금한다. '송금했어요'는 알림일 뿐이고,
// 확정 기준은 결제자가 확인해 송금이 기록된 것이다(PRD §7.2와 같은 규칙).
export function qrProgress(people: SpotParticipant[], payerMemberId: string): { due: number; done: number } {
  const due = people.filter((m) => m.isQr && m.memberId !== payerMemberId);
  return { due: due.length, done: due.filter((m) => m.confirmed).length };
}

// QR이 가리키는 공개 웹 주소. /i(초대)와 달리 앱 딥링크를 걸지 않는다 —
// 처음 만난 사람에게 설치를 강요하지 않고 웹에서 끝나야 한다(app.config.ts의 intent-filter는 /i/ 뿐).
export function buildSpotUrl(domain: string, token: string): string {
  return `https://${domain}/s/${token}`;
}

export function spotStatusText(a: {
  expenseCount: number;
  people: number;
  share: number;
  due: number;
  done: number;
}): string {
  const head = `이 자리 정산 · 지출 ${a.expenseCount}건 · ${a.people}명 · 1인 ${formatKrw(a.share)}`;
  return a.due ? `${head} · 송금 ${a.done}/${a.due}` : head;
}
