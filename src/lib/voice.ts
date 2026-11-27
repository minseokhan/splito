// 음성으로 입력: parse-expense(kind 'voice') 결과 → 품목 → 가게별 묶음 → 가게마다 save_expense payload 1건.
import { toCategory, type CategoryCode } from './category';
import { emptyDraft, toSavePayload } from './expenseForm';
import { formatForeign, formatKrw } from './money';
import type { SaveExpensePayload } from '../types/domain';

// supabase/functions/_shared/parseSchema.ts ParsedVoice의 items와 같은 형태
export type VoiceParseItem = {
  // who: 참여자 이름 또는 'me'(말한 사람), 빈 배열 = 나. key: 이어 말하기로 고친 기존 품목, quantity: 개수(구 서버는 둘 다 안 보낸다)
  key?: string | null; store: string | null; who: string[]; title: string; quantity?: number; amount: number; currency: string; category: string; part: string;
};
export type VoiceParse = { items: VoiceParseItem[]; renames?: { from: string; to: string }[] };

export type VoiceItem = {
  key: string;
  store: string | null; // '' = 이름 없는 가게. null은 파싱 직후에만(applyVoiceParse가 지금 보는 가게로 채운다)
  memberIds: string[]; // 이 품목을 나눠 쓴 사람(1명 이상, 똑같이 나눈다)
  title: string;
  quantity: number; // 개수(1 이상). amount는 이 개수만큼의 합계다
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
    quantity: it.quantity ?? 1,
    amount: it.amount,
    currency: it.currency,
    category: toCategory(it.category),
    part: it.part,
  }));
}

// 가게 이름이 같으면 한 묶음(처음 나온 순서). 이름 없는 가게('')도 한 묶음이다.
export function groupByStore(items: VoiceItem[]) {
  const map = new Map<string, VoiceItem[]>();
  for (const it of items) map.set(it.store ?? '', [...(map.get(it.store ?? '') ?? []), it]);
  return [...map].map(([store, list]) => ({ store, items: list }));
}

// 가게 칩: 이름, 없으면 '첫 품목 외 N개' + 합계.
export function storeLabel(store: string, items: VoiceItem[]): string {
  const name = store || `${items[0].title}${items.length > 1 ? ` 외 ${items.length - 1}개` : ''}`;
  return `${name} ${voiceTotal(items)}`;
}

// 이어 말하기용: 화면 품목을 서버에 보낸다(사람은 이름, 나는 'me').
export function voiceCurrent(items: VoiceItem[], people: { id: string; name: string }[], meId: string) {
  return items.map((i) => ({
    key: i.key, store: i.store, title: i.title, quantity: i.quantity, amount: i.amount,
    who: i.memberIds.map((id) => (id === meId ? 'me' : (people.find((p) => p.id === id)?.name ?? ''))).filter(Boolean),
  }));
}

// 응답 반영: 가게 이름 변경 → key가 맞는 품목 고치기(카테고리·통화는 유지) → 나머지는 새 품목.
// 가게를 모르는 새 품목은 지금 보고 있는 가게(fallbackStore)로 넣는다.
export function applyVoiceParse(
  prev: VoiceItem[], parsed: VoiceParse,
  ctx: { people: { id: string; name: string }[]; meId: string; newKey: () => string; fallbackStore: string },
): { items: VoiceItem[]; added: VoiceItem[]; updated: number } {
  let items = prev;
  for (const { from, to } of parsed.renames ?? []) items = items.map((i) => (i.store === from ? { ...i, store: to } : i));
  const added: VoiceItem[] = [];
  let updated = 0;
  for (const p of parsed.items) {
    const [it] = itemsFromParse([p], ctx.people, ctx.meId, ctx.newKey);
    const old = p.key ? items.find((i) => i.key === p.key) : undefined;
    if (old) {
      updated++;
      items = items.map((i) =>
        i === old ? { ...old, store: it.store ?? old.store, memberIds: it.memberIds, title: it.title, quantity: p.quantity ?? old.quantity, amount: it.amount, part: it.part || old.part } : i,
      );
    } else added.push({ ...it, store: it.store ?? ctx.fallbackStore });
  }
  return { items: [...items, ...added], added, updated };
}

export const formatVoiceAmount = (amount: number, currency: string) =>
  currency === 'KRW' ? formatKrw(amount) : formatForeign(amount, currency).replace(/\.00$/, '');

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
  return groupByStore(items).find((s) => new Set(s.items.map((i) => i.currency)).size > 1)?.store ?? null;
}

// 결제자 = 나(공금이면 pool), 품목마다 고른 사람들 몫. 카테고리·통화는 첫 품목. 원화 확정은 save_expense가 한다.
export function storePayload(
  store: string, items: VoiceItem[],
  ctx: { roomId: string; meMemberId: string; todayLocal: string; expenseId: string; newId: () => string; pool?: boolean },
): SaveExpensePayload {
  const d = emptyDraft({
    expenseId: ctx.expenseId, roomId: ctx.roomId, source: 'voice', meMemberId: ctx.meMemberId,
    todayLocal: ctx.todayLocal, newId: () => '', currency: items[0].currency,
  });
  const draft = {
    ...d,
    ...(ctx.pool ? { payerKind: 'pool' as const, payerMemberId: null } : {}),
    merchant: store,
    category: items[0].category,
    aiResult: { parts: items.map((i) => i.part) },
    items: items.map((i, position) => ({
      ...d.items[0], id: ctx.newId(), position, nameOriginal: i.title, nameKo: i.title, quantity: i.quantity, amountOriginal: i.amount, assigneeMemberIds: i.memberIds,
    })),
  };
  return toSavePayload(draft, ctx.meMemberId, []);
}
