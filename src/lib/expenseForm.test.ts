import {
  addItem,
  draftFromExpense,
  draftFromParse,
  emptyDraft,
  kstToday,
  perPersonOriginal,
  mergePayload,
  parseAmountInput,
  previewKrw,
  previewVisibility,
  setAssignees,
  splitItem,
  toDupInput,
  toSavePayload,
  updateItem,
  validateDraft,
  type ExpenseDraft,
  type ParseResult,
} from './expenseForm';

function ids() {
  let n = 0;
  return () => `n${++n}`;
}

const ctx = () => ({
  expenseId: 'e1',
  roomId: 'r1',
  source: 'receipt' as const,
  meMemberId: 'm1',
  todayLocal: '2026-10-22',
  newId: ids(),
});

function parse(over: Partial<ParseResult> = {}): ParseResult {
  return {
    is_receipt: true,
    merchant: '一蘭',
    paid_local_date: '2026-10-21',
    paid_local_time: '18:42',
    currency: 'JPY',
    currency_ambiguous: false,
    total: 3280,
    krw_charged: null,
    card_last4: null,
    category: 'food',
    items: [
      { name_original: 'ラーメン', name_ko: '라멘', quantity: 2, amount: 2000, confidence: 'high' },
      { name_original: 'ビール', name_ko: '맥주', quantity: 1, amount: 1280, confidence: 'high' },
    ],
    confidence: 'high',
    ...over,
  };
}

const sumMilli = (d: ExpenseDraft) => d.items.reduce((a, i) => a + Math.round(i.amountOriginal * 1000), 0);

describe('draftFromParse', () => {
  it('기본값: 결제자 = 나, 카테고리는 AI 값, 박스 position 순서', () => {
    const d = draftFromParse(parse(), ctx());
    expect(d).toMatchObject({
      id: 'e1', roomId: 'r1', source: 'receipt', payerKind: 'member', payerMemberId: 'm1',
      merchant: '一蘭', paidLocalDate: '2026-10-21', paidLocalTime: '18:42', currency: 'JPY',
      category: 'food', needsReview: false,
    });
    expect(d.items.map((i) => [i.position, i.nameKo, i.amountOriginal, i.isAdjustment])).toEqual([
      [0, '라멘', 2000, false],
      [1, '맥주', 1280, false],
    ]);
    expect(d.items.every((i) => i.assigneeMemberIds.length === 0)).toBe(true);
  });

  it('품목 합계 < 총액이면 양수 조정 박스(기타·확인 필요)를 마지막에 추가', () => {
    const d = draftFromParse(parse({ total: 3608 }), ctx());
    const last = d.items[d.items.length - 1];
    expect(last).toMatchObject({ position: 2, nameKo: '기타', amountOriginal: 328, isAdjustment: true, needsReview: true });
    expect(sumMilli(d)).toBe(3608000);
  });

  it('품목 합계 > 총액이면 음수 할인 박스, 소수 3자리도 정수 비교', () => {
    const d = draftFromParse(parse({
      currency: 'USD', total: 0.3,
      items: [
        { name_original: 'a', name_ko: 'a', quantity: 1, amount: 0.1, confidence: 'high' },
        { name_original: 'b', name_ko: 'b', quantity: 1, amount: 0.2, confidence: 'high' },
      ],
    }), ctx());
    expect(d.items).toHaveLength(2); // 0.1+0.2 ≠ 0.3 부동소수 문제로 조정 박스가 생기면 안 된다

    const d2 = draftFromParse(parse({ total: 3000 }), ctx());
    expect(d2.items[2]).toMatchObject({ amountOriginal: -280, isAdjustment: true, needsReview: true });
    expect(sumMilli(d2)).toBe(3000000);
  });

  it('총액만 있고 품목이 없으면 총액 박스 1개', () => {
    const d = draftFromParse(parse({ items: [], total: 15000 }), ctx());
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ position: 0, amountOriginal: 15000, isAdjustment: false });
  });

  it('confidence low 품목은 needsReview, 지출 전체 low·통화 모호는 draft.needsReview', () => {
    const d = draftFromParse(parse({
      items: [
        { name_original: 'x', name_ko: 'x', quantity: 1, amount: 2000, confidence: 'low' },
        { name_original: 'y', name_ko: 'y', quantity: 1, amount: 1280, confidence: 'high' },
      ],
    }), ctx());
    expect(d.items.map((i) => i.needsReview)).toEqual([true, false]);
    expect(d.needsReview).toBe(false);
    expect(draftFromParse(parse({ confidence: 'low' }), ctx()).needsReview).toBe(true);
    expect(draftFromParse(parse({ currency_ambiguous: true }), ctx()).needsReview).toBe(true);
  });

  it('결제일이 없으면 오늘(현지) + 확인 필요, 원화 청구액·카드 끝자리 반영', () => {
    const d = draftFromParse(parse({ paid_local_date: null, krw_charged: 30120, card_last4: '1234' }), ctx());
    expect(d.paidLocalDate).toBe('2026-10-22');
    expect(d.needsReview).toBe(true);
    expect(d.krwCharged).toBe(30120);
    expect(d.cardLast4).toBe('1234');
  });
});

describe('emptyDraft', () => {
  it('결제일 = 오늘(현지), 빈 박스 1개, 결제자 나, 카테고리 기타', () => {
    const d = emptyDraft({ ...ctx(), source: 'manual', currency: 'JPY' });
    expect(d).toMatchObject({
      source: 'manual', paidLocalDate: '2026-10-22', paidLocalTime: null, currency: 'JPY',
      payerMemberId: 'm1', category: 'other', merchant: '', photos: [],
    });
    expect(d.items).toHaveLength(1);
    expect(d.items[0].amountOriginal).toBe(0);
  });
});

describe('splitItem', () => {
  it('금액을 반으로(소수 3자리 floor), 나머지는 원 박스, 합 보존, 새 박스는 바로 뒤', () => {
    const d = draftFromParse(parse({ currency: 'USD', total: null, items: [
      { name_original: 'a', name_ko: 'a', quantity: 1, amount: 10.001, confidence: 'high' },
      { name_original: 'b', name_ko: 'b', quantity: 1, amount: 5, confidence: 'high' },
    ] }), ctx());
    const before = sumMilli(d);
    const s = splitItem(d, d.items[0].id, () => 'new');
    expect(sumMilli(s)).toBe(before);
    expect(s.items.map((i) => [i.id, i.amountOriginal])).toEqual([[d.items[0].id, 5.001], ['new', 5], [d.items[1].id, 5]]);
    expect(s.items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it('음수 할인 박스도 합 보존', () => {
    const d = draftFromParse(parse({ total: 3000 }), ctx());
    const adj = d.items[2];
    const s = splitItem(d, adj.id, () => 'new');
    expect(sumMilli(s)).toBe(sumMilli(d));
  });
});

describe('addItem', () => {
  it('마지막에 빈 박스 추가, position은 다음 번호', () => {
    const d = addItem(draftFromParse(parse(), ctx()), () => 'add');
    expect(d.items[2]).toMatchObject({ id: 'add', position: 2, amountOriginal: 0, isAdjustment: false, assigneeMemberIds: [] });
  });
});

describe('validateDraft', () => {
  const base = () => draftFromParse(parse(), ctx());

  it('정상', () => {
    expect(validateDraft(base(), '2026-10-22')).toEqual({ ok: true });
  });
  it('Σ 박스 원본 ≤ 0 → AMOUNT_INVALID', () => {
    const d = base();
    expect(validateDraft({ ...d, items: [] }, '2026-10-22')).toMatchObject({ ok: false, code: 'AMOUNT_INVALID' });
    expect(validateDraft({ ...d, items: [{ ...d.items[0], amountOriginal: 100 }, { ...d.items[1], amountOriginal: -100 }] }, '2026-10-22'))
      .toMatchObject({ ok: false, code: 'AMOUNT_INVALID' });
  });
  it('원화 청구액 ≤ 0 → AMOUNT_INVALID', () => {
    expect(validateDraft({ ...base(), krwCharged: 0 }, '2026-10-22')).toMatchObject({ ok: false, code: 'AMOUNT_INVALID', field: 'krwCharged' });
  });
  it('결제일 > KST 오늘+1 → DATE_IN_FUTURE, +1은 허용(월말 넘김 포함)', () => {
    expect(validateDraft({ ...base(), paidLocalDate: '2026-10-23' }, '2026-10-22')).toEqual({ ok: true });
    expect(validateDraft({ ...base(), paidLocalDate: '2026-10-24' }, '2026-10-22')).toMatchObject({ ok: false, code: 'DATE_IN_FUTURE' });
    expect(validateDraft({ ...base(), paidLocalDate: '2026-11-01' }, '2026-10-31')).toEqual({ ok: true });
    expect(validateDraft({ ...base(), paidLocalDate: '2026-11-02' }, '2026-10-31')).toMatchObject({ ok: false, code: 'DATE_IN_FUTURE' });
  });
  it('형식 오류 → INVALID_INPUT', () => {
    expect(validateDraft({ ...base(), currency: 'jp' }, '2026-10-22')).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'currency' });
    expect(validateDraft({ ...base(), paidLocalDate: '10/21' }, '2026-10-22')).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'paidLocalDate' });
    expect(validateDraft({ ...base(), cardLast4: '12' }, '2026-10-22')).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'cardLast4' });
    expect(validateDraft({ ...base(), payerKind: 'member', payerMemberId: null }, '2026-10-22')).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'payer' });
  });
});

describe('toSavePayload', () => {
  const assign = (d: ExpenseDraft, ids: string[][]) => ({ ...d, items: d.items.map((it, i) => ({ ...it, assigneeMemberIds: ids[i] })) });

  it('서버 payload 키와 일치, 원화 금액은 넣지 않는다', () => {
    const base = draftFromParse(parse({ krw_charged: 30120 }), ctx());
    const p = toSavePayload(
      { ...assign(base, [['m1', 'm2'], ['m3']]), photos: [{ storagePath: 'r1/e1/p.jpg', kind: 'receipt' }] },
      'm1',
      ['m1', 'm2', 'm3'],
    );
    expect(Object.keys(p).sort()).toEqual([
      'ai_result', 'card_last4', 'category', 'currency', 'id', 'items', 'krw_charged', 'merchant', 'needs_review',
      'paid_local_date', 'paid_local_time', 'payer_kind', 'payer_member_id', 'photos', 'room_id', 'scope_member_ids', 'source',
    ]);
    expect(Object.keys(p.items[0]).sort()).toEqual([
      'amount_original', 'assignee_member_ids', 'id', 'is_adjustment', 'name_ko', 'name_original', 'needs_review', 'position', 'quantity',
    ]);
    expect(p.photos).toEqual([{ storage_path: 'r1/e1/p.jpg', kind: 'receipt' }]);
    expect(p).toMatchObject({ id: 'e1', room_id: 'r1', krw_charged: 30120, category: 'food' });
    expect(JSON.stringify(p)).not.toMatch(/krw_amount/);
  });

  it('공금 결제면 payer_member_id null, 빈 가맹점은 null', () => {
    const d = { ...draftFromParse(parse(), ctx()), payerKind: 'pool' as const, merchant: '  ' };
    expect(toSavePayload(d, 'm1', ['m1'])).toMatchObject({ payer_kind: 'pool', payer_member_id: null, merchant: null });
  });

  it('scope = 모든 박스 지정 인원의 합집합(중복 없이, 나온 순서)', () => {
    const d = assign(draftFromParse(parse(), ctx()), [['m2', 'm1'], ['m2', 'm3']]);
    expect(toSavePayload(d, 'm1', ['m1', 'm2', 'm3']).scope_member_ids).toEqual(['m2', 'm1', 'm3']);
  });

  it('아무 박스도 지정이 없으면 활동 중인 참여자 전원', () => {
    const d = draftFromParse(parse(), ctx());
    expect(toSavePayload(d, 'm1', ['m1', 'm2']).scope_member_ids).toEqual(['m1', 'm2']);
  });

  it('모든 박스가 나 혼자면 나만 보기(scope = 나)', () => {
    const d = assign(draftFromParse(parse(), ctx()), [['m1'], ['m1']]);
    expect(toSavePayload(d, 'm1', ['m1', 'm2']).scope_member_ids).toEqual(['m1']);
  });

  // 빈 지정 = 전원 1/N 이므로 그 박스는 활동 참여자 전원을 scope에 넣는다.
  // 0명으로 세면 "박스1은 서연, 박스2는 전원"이 scope=[서연]으로 줄어 박스2가 서연 몫이 되고
  // 결제자가 나일 때 지출 전체가 나만 보기로 뒤집혀 정산에서 빠진다.
  it('한 박스라도 지정이 비어 있으면 scope에 활동 참여자 전원이 들어간다', () => {
    const d = assign(draftFromParse(parse(), ctx()), [['m2'], []]);
    // 나온 순서: 박스1의 m2가 먼저, 그 뒤 빈 박스가 보탠 전원.
    expect(toSavePayload(d, 'm1', ['m1', 'm2', 'm3']).scope_member_ids).toEqual(['m2', 'm1', 'm3']);
  });

  it('빈 박스가 섞이면 결제자가 나여도 나만 보기가 되지 않는다', () => {
    const d = assign(draftFromParse(parse(), ctx()), [['m1'], []]);
    expect(previewVisibility(d, 'm1', ['m1', 'm2'])).toBe('shared');
  });

  it('활동 참여자가 비어도 scope는 빈 배열로 내보내지 않는다(서버가 거부)', () => {
    const d = draftFromParse(parse(), ctx());
    expect(toSavePayload(d, 'm1', []).scope_member_ids).toEqual(['m1']);
    // 나조차 없으면 더 채울 값이 없다(화면이 저장 버튼을 누르게 두지 않는다).
    expect(toSavePayload(d, null, []).scope_member_ids).toEqual([]);
  });

  it('카테고리는 draft 값을 그대로 보낸다', () => {
    const d = { ...draftFromParse(parse({ category: 'lodging' }), ctx()), category: 'transport' as const };
    expect(toSavePayload(d, 'm1', ['m1']).category).toBe('transport');
    expect(toSavePayload(draftFromParse(parse({ category: '모르는값' }), ctx()), 'm1', ['m1']).category).toBe('other');
  });
});

describe('updateItem · setAssignees', () => {
  const d = () => draftFromParse(parse(), ctx());
  it('금액을 바꾸고 확인 필요를 해제한다', () => {
    const x = d();
    const id = x.items[0].id;
    const y = updateItem(x, id, { amountOriginal: 2500, needsReview: false });
    expect(y.items[0]).toMatchObject({ amountOriginal: 2500, needsReview: false });
    expect(y.items[1]).toBe(x.items[1]);
  });
  it('박스의 지정 인원을 그대로 바꾼다(다른 박스는 그대로)', () => {
    const x = d();
    const y = setAssignees(x, x.items[0].id, ['m1', 'm3']);
    expect(y.items[0].assigneeMemberIds).toEqual(['m1', 'm3']);
    expect(y.items[1]).toBe(x.items[1]);
  });
});

describe('parseAmountInput', () => {
  it.each([
    ['3,280', 3280],
    ['12.5', 12.5],
    ['-1,000', -1000],
    ['0.125', 0.125],
  ])('%s → %s', (s, v) => expect(parseAmountInput(s)).toBe(v));
  it.each(['', '-', 'abc', '1.2345', '1..2'])('%s → null', (s) => expect(parseAmountInput(s)).toBeNull());
});

describe('previewKrw', () => {
  const base = (over: Partial<ExpenseDraft> = {}) => ({ ...draftFromParse(parse(), ctx()), ...over });
  it('환율로 총액을 구하고 박스에 최대 잔여 배분한다(합계 = 총액)', () => {
    const p = previewKrw(base(), 9.1234)!;
    expect(p.totalKrw).toBe(29925); // 3280 × 9.1234 = 29924.75
    expect(p.boxKrw.reduce((a, b) => a + b, 0)).toBe(29925);
  });
  it('승인 문자 청구액이 있으면 그 금액이 총액이다', () => {
    expect(previewKrw(base({ krwCharged: 30000 }), null)!.totalKrw).toBe(30000);
  });
  it('KRW는 환율 없이 원본 그대로', () => {
    const x = base({ currency: 'KRW' });
    expect(previewKrw(x, null)!.totalKrw).toBe(3280);
  });
  it('환율이 없거나 원본 합계 ≤ 0이면 null', () => {
    expect(previewKrw(base(), null)).toBeNull();
    const x = base();
    expect(previewKrw({ ...x, items: x.items.map((it) => ({ ...it, amountOriginal: 0 })) }, 9)).toBeNull();
  });
});

// 서버(save_expense) 판정과 같은 규칙. 화면 한 줄 표시용.
describe('previewVisibility', () => {
  const base = (over: Partial<ExpenseDraft> = {}) => ({ ...draftFromParse(parse(), ctx()), ...over });
  const withAssignees = (ids: string[][]) => base({ items: base().items.map((it, i) => ({ ...it, assigneeMemberIds: ids[i] })) });

  it('내가 결제 + 모든 박스가 나 혼자 → private', () => {
    expect(previewVisibility(withAssignees([['m1'], ['m1']]), 'm1', ['m1', 'm2'])).toBe('private');
    // 참여자가 나뿐이면 지정이 비어도 나만 보기
    expect(previewVisibility(base(), 'm1', ['m1'])).toBe('private');
  });
  it('남이 한 박스라도 들어가면 shared', () => {
    expect(previewVisibility(withAssignees([['m1'], ['m1', 'm2']]), 'm1', ['m1', 'm2'])).toBe('shared');
    expect(previewVisibility(withAssignees([['m2'], ['m2']]), 'm1', ['m1', 'm2'])).toBe('shared');
  });
  it('지정이 비어 있으면 전원이라 shared', () => {
    expect(previewVisibility(base(), 'm1', ['m1', 'm2'])).toBe('shared');
  });
  it('남이 결제했거나 공금 결제면 shared', () => {
    expect(previewVisibility(withAssignees([['m1'], ['m1']]), 'm1', ['m1'])).toBe('private');
    expect(previewVisibility({ ...withAssignees([['m1'], ['m1']]), payerMemberId: 'm2' }, 'm1', ['m1'])).toBe('shared');
    expect(previewVisibility({ ...withAssignees([['m1'], ['m1']]), payerKind: 'pool', payerMemberId: null }, 'm1', ['m1'])).toBe('shared');
  });
});

describe('toDupInput', () => {
  it('원본 합계와 미리보기 원화로 중복 비교 입력을 만든다', () => {
    expect(toDupInput(draftFromParse(parse(), ctx()), 29925)).toEqual({
      merchant: '一蘭', paidLocalDate: '2026-10-21', paidLocalTime: '18:42', currency: 'JPY',
      amountOriginal: 3280, krwAmount: 29925,
    });
  });
});

describe('mergePayload', () => {
  const existing = {
    ...toSavePayload(draftFromParse(parse(), ctx()), 'm1', ['m1']),
    id: 'old', photos: [{ storage_path: 'r1/old/a.jpg', kind: 'receipt' as const }],
  };
  it('기존 박스는 그대로 두고 사진을 덧붙이며 청구액이 있으면 적용한다', () => {
    const d = { ...draftFromParse(parse(), ctx()), krwCharged: 30000 };
    const p = mergePayload(existing, d, [{ storage_path: 'r1/old/b.jpg', kind: 'capture' }]);
    expect(p.items).toBe(existing.items);
    expect(p.photos).toEqual([...existing.photos, { storage_path: 'r1/old/b.jpg', kind: 'capture' }]);
    expect(p.krw_charged).toBe(30000);
  });
  it('청구액이 없으면 기존 값을 유지한다', () => {
    const p = mergePayload({ ...existing, krw_charged: 100 }, draftFromParse(parse(), ctx()), []);
    expect(p.krw_charged).toBe(100);
  });
});

describe('kstToday · perPersonOriginal', () => {
  it('UTC 15시 이후는 KST 다음 날', () => {
    expect(kstToday(new Date('2026-10-21T14:59:00Z'))).toBe('2026-10-21');
    expect(kstToday(new Date('2026-10-21T15:00:00Z'))).toBe('2026-10-22');
  });
  it('원본 금액을 floor로 나눈다(소수 3자리)', () => {
    expect(perPersonOriginal(3280, 2)).toBe(1640);
    expect(perPersonOriginal(10, 3)).toBe(3.333);
    expect(perPersonOriginal(-100, 3)).toBe(-33.334);
  });
});

describe('draftFromExpense', () => {
  const saved = {
    id: 'e1', room_id: 'r1', payer_kind: 'member' as const, payer_member_id: 'm2', source: 'receipt' as const,
    merchant: '一蘭', paid_local_date: '2026-10-21', paid_local_time: '18:42:00', currency: 'JPY',
    krw_charged: null, manual_rate: null, card_last4: '1234', needs_review: true, ai_result: { x: 1 },
    category: 'food' as const, scope_member_ids: ['m1', 'm2'],
    items: [
      { id: 'i1', position: 0, name_original: 'ラーメン', name_ko: '라멘', quantity: 2, amount_original: 2000,
        needs_review: false, is_adjustment: false, assignee_member_ids: ['m1'] },
      { id: 'i2', position: 1, name_original: '', name_ko: null, quantity: 1, amount_original: -100,
        needs_review: true, is_adjustment: true, assignee_member_ids: ['m2'] },
    ],
    photos: [{ storage_path: 'r1/e1/p.jpg', kind: 'receipt' as const }],
  };

  it('저장된 지출을 draft로 바꾸고 다시 payload로 바꾸면 같은 값(박스 id·지정·사진 유지)', () => {
    const d = draftFromExpense(saved);
    expect(d).toMatchObject({ id: 'e1', payerMemberId: 'm2', paidLocalTime: '18:42:00', needsReview: true, category: 'food' });
    expect(d.items[1]).toMatchObject({ id: 'i2', nameKo: '', amountOriginal: -100, isAdjustment: true });
    // scope는 draft에 담지 않고 박스 지정의 합집합으로 다시 만든다.
    const { manual_rate: _, ...rest } = saved;
    expect(toSavePayload(d, 'm1', ['m1', 'm2'])).toEqual(rest);
  });

  it('모르는 카테고리는 기타로 접는다', () => {
    expect(draftFromExpense({ ...saved, category: 'nope' as never }).category).toBe('other');
    expect(draftFromExpense({ ...saved, category: null }).category).toBe('other');
  });
});
