import {
  applyVoiceParse, canFinishEdit, formatVoiceAmount, toggleMember, groupByStore, itemsFromParse, mixedCurrencyStore, storeLabel, storePayload,
  voiceCurrent, voiceTotal, type VoiceItem,
} from './voice';

const ME = 'm-me';
const PEOPLE = [
  { id: ME, name: '민지' },
  { id: 'm-jh', name: '지훈' },
  { id: 'm-sy', name: '서연' },
];
let n = 0;
const newKey = () => `k${++n}`;
const parsed = (over: Partial<Parameters<typeof itemsFromParse>[0][number]> = {}) => ({
  store: '편의점' as string | null, who: ['지훈'], title: '과자', amount: 5000, currency: 'KRW', category: 'food', part: '지훈이 과자 5천 원', ...over,
});
const vi = (over: Partial<VoiceItem> = {}): VoiceItem => ({
  key: 'k', store: '편의점', memberIds: ['m-jh'], title: '과자', quantity: 1, amount: 5000, currency: 'KRW', category: 'food', part: '지훈이 과자 5천 원', ...over,
});

describe('itemsFromParse', () => {
  it('이름을 멤버 id로 바꾸고 가게를 그대로 둔다', () => {
    const items = itemsFromParse([parsed(), parsed({ store: null, who: ['서연'], title: '맥주' })], PEOPLE, ME, newKey);
    expect(items.map((i) => [i.store, i.memberIds, i.title])).toEqual([['편의점', ['m-jh'], '과자'], [null, ['m-sy'], '맥주']]);
  });

  it('store가 빠진 응답(구 서버)도 가게 모름(null)으로 둔다', () => {
    const [x] = itemsFromParse([{ ...parsed(), store: undefined as unknown as null }], PEOPLE, ME, newKey);
    expect(x.store).toBeNull();
  });

  it('여러 사람은 한 품목에, me는 나, 비거나 목록에 없으면 나, 모르는 카테고리는 other', () => {
    const many = itemsFromParse([parsed({ who: ['me', '지훈', '민지', '서연'] })], PEOPLE, ME, newKey);
    expect(many[0].memberIds).toEqual([ME, 'm-jh', 'm-sy']);
    const items = itemsFromParse([parsed({ who: [] }), parsed({ who: ['철수'], category: 'weird' })], PEOPLE, ME, newKey);
    expect(items.map((i) => i.memberIds)).toEqual([[ME], [ME]]);
    expect(items[1].category).toBe('other');
  });

  it('quantity를 그대로, 없으면(구 서버) 1', () => {
    const items = itemsFromParse([parsed({ title: '생맥주', quantity: 2, amount: 1000 }), parsed()], PEOPLE, ME, newKey);
    expect(items.map((i) => i.quantity)).toEqual([2, 1]);
  });
});

describe('groupByStore', () => {
  it('같은 가게는 처음 나온 순서대로 한 묶음, 이름 없는 가게(\'\')도 한 묶음', () => {
    const a = vi({ key: 'a', store: '카레집' });
    const b = vi({ key: 'b', store: '' });
    const d = vi({ key: 'd', store: '카레집' });
    expect(groupByStore([a, b, d]).map((s) => [s.store, s.items.map((x) => x.key)])).toEqual([['카레집', ['a', 'd']], ['', ['b']]]);
  });
});

describe('storeLabel', () => {
  it('이름이 있으면 이름, 없으면 첫 품목 외 N개 + 합계', () => {
    expect(storeLabel('백화점', [vi({ amount: 200000 })])).toBe('백화점 200,000원');
    expect(storeLabel('', [vi(), vi({ title: '음료수', amount: 6000 })])).toBe('과자 외 1개 11,000원');
    expect(storeLabel('', [vi()])).toBe('과자 5,000원');
  });
});

describe('voiceCurrent', () => {
  it('화면 품목을 서버에 보낼 모양으로: 사람은 이름, 나는 me', () => {
    expect(voiceCurrent([vi({ key: 'k1', memberIds: [ME, 'm-jh'], quantity: 2 })], PEOPLE, ME)).toEqual([
      { key: 'k1', store: '편의점', title: '과자', quantity: 2, amount: 5000, who: ['me', '지훈'] },
    ]);
  });
});

describe('applyVoiceParse', () => {
  const ctx = { people: PEOPLE, meId: ME, newKey: () => 'new', fallbackStore: '편의점' };
  const prev = [vi({ key: 'k1', category: 'shopping' }), vi({ key: 'k2', store: '카페', title: '라떼', amount: 4000 })];

  it('key가 있으면 그 품목을 고치고(카테고리는 유지), 없으면 새 품목으로 붙인다', () => {
    const r = applyVoiceParse(prev, { items: [parsed({ key: 'k1', amount: 6000, who: ['서연'] }), parsed({ key: null, title: '빵', amount: 3000 })] }, ctx);
    expect(r.items.map((i) => [i.key, i.title, i.amount, i.memberIds, i.category])).toEqual([
      ['k1', '과자', 6000, ['m-sy'], 'shopping'],
      ['k2', '라떼', 4000, ['m-jh'], 'food'],
      ['new', '빵', 3000, ['m-jh'], 'food'],
    ]);
    expect(r.added.map((i) => i.key)).toEqual(['new']);
    expect(r.updated).toBe(1);
  });

  it('모르는 key(구 서버는 key가 없다)는 새 품목, 가게를 모르는 새 품목은 지금 보는 가게로', () => {
    const r = applyVoiceParse(prev, { items: [parsed({ key: 'zzz', store: null })] }, ctx);
    expect(r.items.at(-1)).toMatchObject({ key: 'new', store: '편의점' });
    expect(r.updated).toBe(0);
  });

  it('고친 품목의 가게가 null이면 원래 가게를 둔다', () => {
    const r = applyVoiceParse(prev, { items: [parsed({ key: 'k2', store: null, amount: 4500 })] }, ctx);
    expect(r.items[1]).toMatchObject({ key: 'k2', store: '카페', amount: 4500 });
  });

  it('고친 품목의 quantity를 반영하고, 응답에 없으면(구 서버) 원래 값을 둔다', () => {
    const base = [vi({ key: 'k1', quantity: 2, amount: 1000 })];
    expect(applyVoiceParse(base, { items: [parsed({ key: 'k1', quantity: 3, amount: 1500 })] }, ctx).items[0]).toMatchObject({ quantity: 3, amount: 1500 });
    expect(applyVoiceParse(base, { items: [parsed({ key: 'k1', amount: 1200 })] }, ctx).items[0]).toMatchObject({ quantity: 2, amount: 1200 });
  });

  it('renames는 그 가게 품목 전부의 가게 이름을 바꾼다', () => {
    const r = applyVoiceParse(prev, { items: [], renames: [{ from: '카페', to: '스타벅스' }] }, ctx);
    expect(r.items.map((i) => i.store)).toEqual(['편의점', '스타벅스']);
  });
});

describe('금액 표시·합계', () => {
  it('원화는 원, 외화는 통화 기호', () => {
    expect(formatVoiceAmount(5000, 'KRW')).toBe('5,000원');
    expect(formatVoiceAmount(1000, 'JPY')).toBe('¥1,000');
  });

  it('말로 한 금액은 정수라 달러도 소수점(.00)을 붙이지 않는다', () => {
    expect(formatVoiceAmount(1100, 'USD')).toBe('$1,100');
    expect(formatVoiceAmount(1000.5, 'USD')).toBe('$1,000.50');
  });

  it('합계는 통화별로 더해 등장 순서대로 잇는다', () => {
    expect(voiceTotal([vi(), vi({ amount: 4000 })])).toBe('9,000원');
    expect(voiceTotal([vi(), vi({ amount: 1000, currency: 'JPY' }), vi({ amount: 500, currency: 'JPY' })])).toBe('5,000원 + ¥1,500');
  });
});

describe('canFinishEdit', () => {
  it('품목 1자 이상 && 금액 > 0', () => {
    expect(canFinishEdit(vi())).toBe(true);
    expect(canFinishEdit(vi({ title: '  ' }))).toBe(false);
    expect(canFinishEdit(vi({ amount: 0 }))).toBe(false);
  });
});

describe('toggleMember', () => {
  it('켜고 끄되 마지막 한 명은 못 끈다', () => {
    expect(toggleMember(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleMember(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleMember(['a'], 'a')).toEqual(['a']);
  });
});

describe('mixedCurrencyStore', () => {
  it('한 가게에 통화가 섞였으면 그 가게 이름', () => {
    expect(mixedCurrencyStore([vi(), vi({ store: '택시' })])).toBeNull();
    expect(mixedCurrencyStore([vi(), vi({ currency: 'JPY' })])).toBe('편의점');
  });
});

describe('storePayload', () => {
  let id = 0;
  const ctx = { roomId: 'r1', meMemberId: ME, todayLocal: '2026-11-15', expenseId: 'e1', newId: () => `i${++id}` };

  it('가게 1곳 = 지출 1건: 결제자 나, 품목마다 그 사람 몫, 분담 범위는 품목 사람들의 합', () => {
    id = 0;
    const p = storePayload('카레집', [
      vi({ store: '카레집', memberIds: ['m-jh', 'm-sy'], title: '카레', amount: 1200, currency: 'JPY', part: '민수가 카레 1200엔' }),
      vi({ store: '카레집', memberIds: [ME], title: '돈까스', amount: 1000, currency: 'JPY', category: 'shopping', part: '내가 돈까스 1000엔' }),
      vi({ store: '카레집', memberIds: ['m-jh'], title: '맥주', quantity: 2, amount: 1000, currency: 'JPY', part: '맥주' }),
    ], ctx);
    expect(p).toMatchObject({
      id: 'e1', room_id: 'r1', payer_kind: 'member', payer_member_id: ME, source: 'voice', merchant: '카레집',
      paid_local_date: '2026-11-15', currency: 'JPY', category: 'food', scope_member_ids: ['m-jh', 'm-sy', ME],
      ai_result: { parts: ['민수가 카레 1200엔', '내가 돈까스 1000엔', '맥주'] },
    });
    expect(p.items.map((x) => [x.id, x.position, x.name_original, x.quantity, x.amount_original, x.assignee_member_ids])).toEqual([
      ['i1', 0, '카레', 1, 1200, ['m-jh', 'm-sy']],
      ['i2', 1, '돈까스', 1, 1000, [ME]],
      ['i3', 2, '맥주', 2, 1000, ['m-jh']],
    ]);
  });

  it('공금 결제면 결제자 없이 pool, 이름 없는 가게는 가맹점 없음', () => {
    const p = storePayload('', [vi()], { ...ctx, pool: true });
    expect(p).toMatchObject({ payer_kind: 'pool', payer_member_id: null, merchant: null });
  });
});
