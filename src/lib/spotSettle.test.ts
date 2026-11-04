import {
  nextExpenseSelection,
  qrProgress,
  spotStatusText,
  spotTotals,
  type SpotExpense,
  type SpotParticipant,
} from './spotSettle';

const ex = (over: Partial<SpotExpense> = {}): SpotExpense => ({
  id: 'e1',
  payerMemberId: 'm-jihun',
  merchant: '쿠시카츠 다루마',
  krwAmount: 81000,
  boxes: [81000],
  currency: 'JPY',
  amountOriginal: 8900,
  ...over,
});

const p = (id: string, kind: SpotParticipant['kind'], over: Partial<SpotParticipant> = {}): SpotParticipant => ({
  memberId: id,
  name: id,
  kind,
  ...over,
});

describe('spotTotals — 서버 분담 규칙(박스마다 floor, 자투리는 결제자)과 같은 값', () => {
  it('나눠떨어지면 모두 같은 몫', () => {
    expect(spotTotals([ex()], 4)).toEqual({ sum: 81000, share: 20250, payerShare: 20250 });
  });

  // 핸드오프 README는 round(sum/n, 10원 단위)를 적었지만 장부(room_balances)는 floor다.
  // 10원 반올림이면 8,330원이 되어 여행 정산과 어긋난다.
  it('나눠떨어지지 않으면 floor — 10원 반올림이 아니다', () => {
    expect(spotTotals([ex({ krwAmount: 25000, boxes: [25000] })], 3)).toEqual({
      sum: 25000,
      share: 8333,
      payerShare: 8334,
    });
  });

  // room_balances는 지출 전체가 아니라 박스마다 나눈다. 두 규칙이 갈라지는 입력으로 확인한다.
  it('박스마다 나눈 합이다 — floor(합/n)이 아니다', () => {
    const e = ex({ krwAmount: 30, boxes: [10, 10, 10] });
    expect(Math.floor(30 / 4)).toBe(7); // 지출 전체를 나누면 7
    expect(spotTotals([e], 4).share).toBe(6); // 장부는 floor(10/4) × 3 = 6
    expect(spotTotals([e], 4).payerShare).toBe(30 - 6 * 3); // 자투리 전부 결제자
  });

  it('자투리는 전부 결제자가 진다 — 합이 지출 총액과 정확히 맞는다', () => {
    const e = ex({ krwAmount: 10000, boxes: [3333, 3333, 3334] });
    const n = 3;
    const { share, payerShare, sum } = spotTotals([e], n);
    expect(share * (n - 1) + payerShare).toBe(sum);
  });

  it('지출 여러 건은 합산한다', () => {
    const a = ex({ id: 'a', krwAmount: 81000, boxes: [81000] });
    const b = ex({ id: 'b', krwAmount: 10920, boxes: [10920] });
    expect(spotTotals([a, b], 4)).toEqual({ sum: 91920, share: 20250 + 2730, payerShare: 20250 + 2730 });
  });

  it('인원이 0이면 0으로 떨어진다(나누기 사고 방지)', () => {
    expect(spotTotals([ex()], 0)).toEqual({ sum: 81000, share: 0, payerShare: 81000 });
  });

  it('원화 미확정(박스 없음) 지출은 0원으로 센다', () => {
    expect(spotTotals([ex({ krwAmount: 0, boxes: [] })], 4)).toEqual({ sum: 0, share: 0, payerShare: 0 });
  });
});

describe('nextExpenseSelection — 지출 체크 규칙', () => {
  const a = ex({ id: 'a', payerMemberId: 'm-jihun' });
  const b = ex({ id: 'b', payerMemberId: 'm-jihun' });
  const other = ex({ id: 'c', payerMemberId: 'm-minji', merchant: '타코야키 와나카' });
  const all = [a, b, other];

  it('같은 결제자 지출은 더하고 뺄 수 있다', () => {
    expect(nextExpenseSelection(all, ['a'], 'b')).toEqual({ selected: ['a', 'b'], payerMemberId: 'm-jihun' });
    expect(nextExpenseSelection(all, ['a', 'b'], 'b')).toEqual({ selected: ['a'], payerMemberId: 'm-jihun' });
  });

  it('마지막 1건은 끌 수 없다', () => {
    expect(nextExpenseSelection(all, ['a'], 'a')).toEqual({ error: 'LAST_EXPENSE' });
  });

  // 한 번의 정산은 결제자가 한 명이다(README §2-2).
  it('결제자가 다른 지출을 고르면 선택이 그 하나로 바뀐다', () => {
    expect(nextExpenseSelection(all, ['a', 'b'], 'c')).toEqual({ selected: ['c'], payerMemberId: 'm-minji' });
  });

  it('선택 순서는 목록 순서를 따른다', () => {
    expect(nextExpenseSelection(all, ['b'], 'a')).toEqual({ selected: ['a', 'b'], payerMemberId: 'm-jihun' });
  });

  it('없는 지출을 고르면 그대로 둔다', () => {
    expect(nextExpenseSelection(all, ['a'], 'zzz')).toEqual({ selected: ['a'], payerMemberId: 'm-jihun' });
  });
});

describe('qrProgress — 송금 done/대상', () => {
  const people = [
    p('m-minji', 'me'),
    p('m-jihun', 'mate'),
    p('m-sky', 'qr', { confirmedAt: '2026-11-04T10:00:00Z' }),
    p('m-park', 'qr'),
  ];

  it('QR 참여자 중 결제자가 아닌 사람이 대상, 확인된 수가 done', () => {
    expect(qrProgress(people, 'm-jihun')).toEqual({ due: 2, done: 1 });
  });

  it('QR 참여자가 없으면 0/0', () => {
    expect(qrProgress(people.slice(0, 2), 'm-jihun')).toEqual({ due: 0, done: 0 });
  });

  // '송금했어요'만 누른 상태는 아직 done이 아니다 — 확정 기준은 결제자의 확인이다(PRD §7.2와 같은 규칙).
  it('보고만 하고 확인 전이면 done이 아니다', () => {
    const reported = [p('m-sky', 'qr', { reportedAt: '2026-11-04T10:00:00Z' })];
    expect(qrProgress(reported, 'm-jihun')).toEqual({ due: 1, done: 0 });
  });
});

describe('spotStatusText — 일정 카드 상태 줄', () => {
  it('QR 대상이 있으면 송금 진행을 붙인다', () => {
    expect(spotStatusText({ expenseCount: 1, people: 4, share: 20250, due: 2, done: 0 })).toBe(
      '이 자리 정산 · 지출 1건 · 4명 · 1인 20,250원 · 송금 0/2',
    );
  });

  it('QR 대상이 없으면 송금 부분을 뺀다', () => {
    expect(spotStatusText({ expenseCount: 2, people: 3, share: 10000, due: 0, done: 0 })).toBe(
      '이 자리 정산 · 지출 2건 · 3명 · 1인 10,000원',
    );
  });
});
