import type { ExpenseDraft } from './expenseForm';
import { autoSelectPayer, fillEqual, poolNote, poolRemaining, poolShortage, refillPerPerson, sumKrw } from './pool';

const draft = (cardLast4: string | null): ExpenseDraft => ({
  id: 'e1', roomId: 'r1', source: 'card_text', payerKind: 'member', payerMemberId: 'm1',
  merchant: '', paidLocalDate: '2026-10-22', paidLocalTime: null, currency: 'KRW', krwCharged: null,
  cardLast4, category: 'other', items: [], photos: [], needsReview: false, aiResult: null,
});

describe('autoSelectPayer', () => {
  const pool = { enabled: true, cardLast4: ['1234', '5678'] };

  it('끝자리가 공금 카드와 일치하면 결제자를 공금으로', () => {
    const d = autoSelectPayer(draft('5678'), pool);
    expect(d.payerKind).toBe('pool');
    expect(d.payerMemberId).toBeNull();
  });

  it('불일치·끝자리 없음·공금 꺼짐이면 그대로', () => {
    for (const [d, p] of [
      [draft('9999'), pool],
      [draft(null), pool],
      [draft('1234'), { ...pool, enabled: false }],
    ] as const) {
      expect(autoSelectPayer(d, p)).toBe(d);
    }
  });
});

describe('poolNote', () => {
  it('남으면 돌려줄 금액, 부족하면 받을 금액, 0이면 null', () => {
    expect(poolNote(100000, 'B')).toBe('남은 공금 100,000원은 B 님이 돌려줄 금액에 포함됐어요');
    expect(poolNote(-5000, 'B')).toBe('부족한 공금 5,000원은 B 님이 받을 금액에 포함됐어요');
    expect(poolNote(0, 'B')).toBeNull();
  });
});

describe('poolRemaining', () => {
  it('입금 합계 − 공금 결제 합계(음수 허용)', () => {
    expect(poolRemaining([200000, 200000, 200000, 200000], [700000])).toBe(100000);
    expect(poolRemaining([100000], [60000, 50000])).toBe(-10000);
    expect(poolRemaining([], [])).toBe(0);
  });
});

describe('fillEqual', () => {
  it('모든 참여자에게 같은 금액', () => {
    expect(fillEqual(['m1', 'g1'], 200000)).toEqual([
      { memberId: 'm1', amountKrw: 200000 },
      { memberId: 'g1', amountKrw: 200000 },
    ]);
  });
});

describe('poolShortage', () => {
  it('잔액보다 크면 넘는 만큼과 기록 후 잔액(음수)', () => {
    expect(poolShortage(18400, 30000)).toEqual({ over: 11600, after: -11600 });
  });
  it('이미 마이너스면 넘는 만큼 = 기록 금액 전부', () => {
    expect(poolShortage(-2000, 5000)).toEqual({ over: 5000, after: -7000 });
  });
  it('잔액 이내·같음이면 null', () => {
    expect(poolShortage(18400, 18400)).toBeNull();
    expect(poolShortage(18400, 100)).toBeNull();
  });
});

describe('refillPerPerson', () => {
  it('부족분을 N명이 나누고 100 단위로 올린다', () => {
    expect(refillPerPerson(11600, 3)).toBe(3900); // 3866.67 → 3900
    expect(refillPerPerson(1200, 3)).toBe(400);
    expect(refillPerPerson(1, 4)).toBe(100);
  });
  it('부족분이 없거나 인원이 0이면 0', () => {
    expect(refillPerPerson(0, 3)).toBe(0);
    expect(refillPerPerson(5000, 0)).toBe(0);
  });
});

describe('sumKrw', () => {
  const toKrw = (amount: number, currency: string) => (currency === 'JPY' ? Math.round(amount * 9.1) : null);
  it('원화는 그대로, 외화는 환산해서 더한다', () => {
    expect(sumKrw([{ amount: 5000, currency: 'KRW' }, { amount: 1000, currency: 'JPY' }], toKrw)).toBe(14100);
  });
  it('환율을 모르는 통화가 섞이면 null', () => {
    expect(sumKrw([{ amount: 10, currency: 'USD' }], toKrw)).toBeNull();
  });
});
