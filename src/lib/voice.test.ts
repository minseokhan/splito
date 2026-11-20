import {
  canFinishEdit, formatVoiceAmount, toggleMember, groupByStore, itemsFromParse, mixedCurrencyStore, newStoreName, storePayload,
  voiceTotal, type VoiceItem,
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
  key: 'k', store: '편의점', memberIds: ['m-jh'], title: '과자', amount: 5000, currency: 'KRW', category: 'food', part: '지훈이 과자 5천 원', ...over,
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
});

describe('groupByStore', () => {
  it('같은 가게는 처음 나온 순서대로 한 묶음, 가게 모르는 품목은 따로', () => {
    const a = vi({ key: 'a', store: '카레집' });
    const b = vi({ key: 'b', store: '편의점' });
    const c = vi({ key: 'c', store: null });
    const d = vi({ key: 'd', store: '카레집' });
    const g = groupByStore([a, b, c, d]);
    expect(g.stores.map((s) => [s.store, s.items.map((x) => x.key)])).toEqual([['카레집', ['a', 'd']], ['편의점', ['b']]]);
    expect(g.unsorted.map((x) => x.key)).toEqual(['c']);
  });
});

describe('newStoreName', () => {
  it('겹치지 않는 "새 가게", "새 가게 2" …', () => {
    expect(newStoreName([vi()])).toBe('새 가게');
    expect(newStoreName([vi({ store: '새 가게' }), vi({ store: '새 가게 2' })])).toBe('새 가게 3');
  });
});

describe('금액 표시·합계', () => {
  it('원화는 원, 외화는 통화 기호', () => {
    expect(formatVoiceAmount(5000, 'KRW')).toBe('5,000원');
    expect(formatVoiceAmount(1000, 'JPY')).toBe('¥1,000');
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
      vi({ store: '카레집', memberIds: ['m-jh'], title: '맥주', amount: 500, currency: 'JPY', part: '맥주' }),
    ], ctx);
    expect(p).toMatchObject({
      id: 'e1', room_id: 'r1', payer_kind: 'member', payer_member_id: ME, source: 'voice', merchant: '카레집',
      paid_local_date: '2026-11-15', currency: 'JPY', category: 'food', scope_member_ids: ['m-jh', 'm-sy', ME],
      ai_result: { parts: ['민수가 카레 1200엔', '내가 돈까스 1000엔', '맥주'] },
    });
    expect(p.items.map((x) => [x.id, x.position, x.name_original, x.amount_original, x.assignee_member_ids])).toEqual([
      ['i1', 0, '카레', 1200, ['m-jh', 'm-sy']],
      ['i2', 1, '돈까스', 1000, [ME]],
      ['i3', 2, '맥주', 500, ['m-jh']],
    ]);
  });
});
