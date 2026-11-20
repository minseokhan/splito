// 말로 입력: parse-expense(kind 'voice') 결과 → 품목 → 가게별 묶음 → 가게마다 save_expense payload 1건.
import { toCategory, type CategoryCode } from './category';
import { emptyDraft, toSavePayload } from './expenseForm';
import { formatForeign, formatKrw } from './money';
import type { SaveExpensePayload } from '../types/domain';

// supabase/functions/_shared/parseSchema.ts ParsedVoice의 items와 같은 형태
export type VoiceParseItem = {
  // who: 참여자 이름 또는 'me'(말한 사람), 빈 배열 = 나
  store: string | null; who: string[]; title: string; amount: number; currency: string; category: string; part: string;
};

export type VoiceItem = {
  key: string;
  store: string | null; // null = AI가 어느 가게인지 판단하지 못함(사용자가 끌어서 넣는다)
  memberIds: string[]; // 이 품목을 나눠 쓴 사람(1명 이상, 똑같이 나눈다)
  title: string;
  amount: number;
  currency: string;
  category: CategoryCode;
  part: string; // 이 품목을 만든 원문 부분
};

// 'me'와 내 이름은 나, 목록에 없는 이름은 뺀다. 아무도 안 남으면 나로 둔다(편집에서 고친다).
export function itemsFromParse(
  items: VoiceParseItem[], people: { id: string; name: string }[], meId: string, newKey: () => string,
): VoiceItem[] {
  return items.map((it) => ({
    key: newKey(),
    store: it.store ?? null, // 구 서버는 store를 안 보낸다
    memberIds: (() => {
      const ids = [...new Set(it.who.map((w) => (w === 'me' ? meId : people.find((p) => p.name === w)?.id)).filter((x): x is string => !!x))];
      return ids.length ? ids : [meId];
    })(),
    title: it.title,
    amount: it.amount,
    currency: it.currency,
    category: toCategory(it.category),
    part: it.part,
  }));
}

// 가게 이름이 같으면 한 묶음(처음 나온 순서). 가게를 모르는 품목은 따로 모은다.
export function groupByStore(items: VoiceItem[]) {
  const map = new Map<string, VoiceItem[]>();
  const unsorted: VoiceItem[] = [];
  for (const it of items) {
    if (it.store === null) unsorted.push(it);
    else map.set(it.store, [...(map.get(it.store) ?? []), it]);
  }
  return { stores: [...map].map(([store, list]) => ({ store, items: list })), unsorted };
}

export function newStoreName(items: VoiceItem[]): string {
  const used = new Set(items.map((i) => i.store));
  let n = 1;
  while (used.has(n === 1 ? '새 가게' : `새 가게 ${n}`)) n++;
  return n === 1 ? '새 가게' : `새 가게 ${n}`;
}

export const formatVoiceAmount = (amount: number, currency: string) =>
  currency === 'KRW' ? formatKrw(amount) : formatForeign(amount, currency);

// 통화가 섞이면 통화별 합계를 등장 순서대로 " + "로 잇는다.
export function voiceTotal(items: VoiceItem[]): string {
  const sums = new Map<string, number>();
  for (const c of items) sums.set(c.currency, (sums.get(c.currency) ?? 0) + c.amount);
  return [...sums].map(([cur, sum]) => formatVoiceAmount(sum, cur)).join(' + ');
}

// 사람 켜고 끄기. 마지막 한 명은 끌 수 없다.
export const toggleMember = (ids: string[], id: string) =>
  ids.includes(id) ? (ids.length > 1 ? ids.filter((x) => x !== id) : ids) : [...ids, id];

export const canFinishEdit = (c: VoiceItem) => c.title.trim().length > 0 && c.amount > 0;

// 지출 1건은 통화 하나다. 한 가게에 통화가 섞였으면 그 가게 이름(저장 전에 막는다).
export function mixedCurrencyStore(items: VoiceItem[]): string | null {
  return groupByStore(items).stores.find((s) => new Set(s.items.map((i) => i.currency)).size > 1)?.store ?? null;
}

// 결제자 = 나, 품목마다 고른 사람들 몫. 카테고리·통화는 첫 품목. 원화 확정은 save_expense가 한다.
export function storePayload(
  store: string, items: VoiceItem[],
  ctx: { roomId: string; meMemberId: string; todayLocal: string; expenseId: string; newId: () => string },
): SaveExpensePayload {
  const d = emptyDraft({
    expenseId: ctx.expenseId, roomId: ctx.roomId, source: 'voice', meMemberId: ctx.meMemberId,
    todayLocal: ctx.todayLocal, newId: () => '', currency: items[0].currency,
  });
  const draft = {
    ...d,
    merchant: store,
    category: items[0].category,
    aiResult: { parts: items.map((i) => i.part) },
    items: items.map((i, position) => ({
      ...d.items[0], id: ctx.newId(), position, nameOriginal: i.title, nameKo: i.title, amountOriginal: i.amount, assigneeMemberIds: i.memberIds,
    })),
  };
  return toSavePayload(draft, ctx.meMemberId, []);
}
