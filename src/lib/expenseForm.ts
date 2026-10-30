// 인식 결과 → 작성 중 지출(draft) → save_expense payload. 원화는 넣지 않는다(서버가 확정, ADR-006).
import type { DupCandidate } from './duplicate';
import { allocateLargestRemainder, floorDiv, roundHalfAwayFromZero, splitEvenly, toKrwPreview } from './money';
import type { ExpenseSource, SaveExpensePayload } from '../types/domain';

// parse-expense 응답(supabase/functions/_shared/parseSchema.ts ParsedExpense와 같은 형태)
export type ParseResult = {
  is_receipt: boolean;
  merchant: string | null;
  paid_local_date: string | null;
  paid_local_time: string | null;
  currency: string | null;
  currency_ambiguous: boolean;
  total: number | null;
  krw_charged: number | null;
  card_last4: string | null;
  items: { name_original: string; name_ko: string; quantity: number; amount: number; confidence: 'high' | 'low' }[];
  confidence: 'high' | 'low';
};

export type DraftItem = {
  id: string; position: number; nameOriginal: string; nameKo: string; quantity: number;
  amountOriginal: number; needsReview: boolean; isAdjustment: boolean; assigneeMemberIds: string[];
};
export type ExpenseDraft = {
  id: string; roomId: string; source: ExpenseSource; payerKind: 'member' | 'pool'; payerMemberId: string | null;
  merchant: string; paidLocalDate: string; paidLocalTime: string | null; currency: string; krwCharged: number | null;
  cardLast4: string | null; scopeMemberIds: string[]; items: DraftItem[];
  photos: { storagePath: string; kind: 'receipt' | 'capture' }[]; needsReview: boolean; aiResult: unknown;
};

type Ctx = {
  expenseId: string; roomId: string; source: ExpenseSource; meMemberId: string;
  activeMemberIds: string[]; todayLocal: string; newId: () => string;
};

// 외화 원본은 소수 3자리라 ×1000 정수로 비교·계산한다.
const toMilli = (x: number) => roundHalfAwayFromZero(x * 1000);
const fromMilli = (m: number) => m / 1000;

function item(id: string, position: number, over: Partial<DraftItem> = {}): DraftItem {
  return {
    id, position, nameOriginal: '', nameKo: '', quantity: 1, amountOriginal: 0,
    needsReview: false, isAdjustment: false, assigneeMemberIds: [], ...over,
  };
}

const renumber = (items: DraftItem[]) => items.map((it, position) => ({ ...it, position }));

export function draftFromParse(parse: ParseResult, ctx: Ctx): ExpenseDraft {
  const items = parse.items.map((p, i) => item(ctx.newId(), i, {
    nameOriginal: p.name_original, nameKo: p.name_ko, quantity: p.quantity,
    amountOriginal: p.amount, needsReview: p.confidence === 'low',
  }));
  if (parse.total !== null) {
    if (items.length === 0) {
      items.push(item(ctx.newId(), 0, { amountOriginal: parse.total }));
    } else {
      const diff = toMilli(parse.total) - items.reduce((a, it) => a + toMilli(it.amountOriginal), 0);
      if (diff !== 0) {
        items.push(item(ctx.newId(), items.length, {
          nameKo: '기타', amountOriginal: fromMilli(diff), isAdjustment: true, needsReview: true,
        }));
      }
    }
  }
  if (items.length === 0) items.push(item(ctx.newId(), 0));
  return {
    id: ctx.expenseId, roomId: ctx.roomId, source: ctx.source,
    payerKind: 'member', payerMemberId: ctx.meMemberId,
    merchant: parse.merchant ?? '',
    paidLocalDate: parse.paid_local_date ?? ctx.todayLocal,
    paidLocalTime: parse.paid_local_time,
    currency: parse.currency ?? '',
    krwCharged: parse.krw_charged === null ? null : roundHalfAwayFromZero(parse.krw_charged),
    cardLast4: parse.card_last4,
    scopeMemberIds: [...ctx.activeMemberIds],
    items, photos: [],
    // 연도 보정은 parse-expense가 confidence low로 표시한다.
    needsReview: parse.confidence === 'low' || parse.currency_ambiguous || parse.paid_local_date === null || parse.currency === null,
    aiResult: parse,
  };
}

// 직접 입력·음성: 결제일 = 오늘(현지), 통화 = 방 기본 통화.
export function emptyDraft(ctx: Ctx & { currency: string }): ExpenseDraft {
  return {
    id: ctx.expenseId, roomId: ctx.roomId, source: ctx.source,
    payerKind: 'member', payerMemberId: ctx.meMemberId,
    merchant: '', paidLocalDate: ctx.todayLocal, paidLocalTime: null, currency: ctx.currency,
    krwCharged: null, cardLast4: null, scopeMemberIds: [...ctx.activeMemberIds],
    items: [item(ctx.newId(), 0)], photos: [], needsReview: false, aiResult: null,
  };
}

export function splitItem(d: ExpenseDraft, itemId: string, newId: () => string): ExpenseDraft {
  const idx = d.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return d;
  const src = d.items[idx];
  const m = toMilli(src.amountOriginal);
  const half = floorDiv(m, 2);
  const items = [...d.items];
  items.splice(idx, 1, { ...src, amountOriginal: fromMilli(m - half) },
    item(newId(), 0, { nameOriginal: src.nameOriginal, nameKo: src.nameKo, amountOriginal: fromMilli(half),
      needsReview: src.needsReview, isAdjustment: src.isAdjustment, assigneeMemberIds: [...src.assigneeMemberIds] }));
  return { ...d, items: renumber(items) };
}

export function addItem(d: ExpenseDraft, newId: () => string): ExpenseDraft {
  return { ...d, items: [...d.items, item(newId(), d.items.length)] };
}

export function toggleScope(d: ExpenseDraft, memberId: string): ExpenseDraft {
  if (!d.scopeMemberIds.includes(memberId)) return { ...d, scopeMemberIds: [...d.scopeMemberIds, memberId] };
  if (d.scopeMemberIds.length <= 1) return d;
  return {
    ...d,
    scopeMemberIds: d.scopeMemberIds.filter((id) => id !== memberId),
    items: d.items.map((it) => ({ ...it, assigneeMemberIds: it.assigneeMemberIds.filter((id) => id !== memberId) })),
  };
}

function addDay(date: string): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export function validateDraft(d: ExpenseDraft, todayKst: string):
  { ok: true } | { ok: false; code: 'AMOUNT_INVALID' | 'SCOPE_EMPTY' | 'DATE_IN_FUTURE' | 'INVALID_INPUT'; field?: string } {
  if (!/^[A-Z]{3}$/.test(d.currency)) return { ok: false, code: 'INVALID_INPUT', field: 'currency' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.paidLocalDate)) return { ok: false, code: 'INVALID_INPUT', field: 'paidLocalDate' };
  if (d.cardLast4 !== null && !/^\d{4}$/.test(d.cardLast4)) return { ok: false, code: 'INVALID_INPUT', field: 'cardLast4' };
  if (d.payerKind === 'member' && !d.payerMemberId) return { ok: false, code: 'INVALID_INPUT', field: 'payer' };
  if (d.items.reduce((a, it) => a + toMilli(it.amountOriginal), 0) <= 0) return { ok: false, code: 'AMOUNT_INVALID', field: 'items' };
  if (d.krwCharged !== null && d.krwCharged <= 0) return { ok: false, code: 'AMOUNT_INVALID', field: 'krwCharged' };
  if (d.paidLocalDate > addDay(todayKst)) return { ok: false, code: 'DATE_IN_FUTURE', field: 'paidLocalDate' };
  if (d.scopeMemberIds.length === 0) return { ok: false, code: 'SCOPE_EMPTY' };
  return { ok: true };
}

export function toSavePayload(d: ExpenseDraft): SaveExpensePayload {
  return {
    id: d.id,
    room_id: d.roomId,
    payer_kind: d.payerKind,
    payer_member_id: d.payerKind === 'pool' ? null : d.payerMemberId,
    source: d.source,
    merchant: d.merchant.trim() || null,
    paid_local_date: d.paidLocalDate,
    paid_local_time: d.paidLocalTime,
    currency: d.currency,
    krw_charged: d.krwCharged,
    card_last4: d.cardLast4,
    needs_review: d.needsReview,
    ai_result: d.aiResult,
    scope_member_ids: d.scopeMemberIds,
    items: d.items.map((it) => ({
      id: it.id,
      position: it.position,
      name_original: it.nameOriginal,
      name_ko: it.nameKo || null,
      quantity: it.quantity,
      amount_original: it.amountOriginal,
      needs_review: it.needsReview,
      is_adjustment: it.isAdjustment,
      assignee_member_ids: it.assigneeMemberIds,
    })),
    photos: d.photos.map((p) => ({ storage_path: p.storagePath, kind: p.kind })),
  };
}

export function updateItem(
  d: ExpenseDraft, itemId: string,
  patch: Partial<Pick<DraftItem, 'nameOriginal' | 'nameKo' | 'quantity' | 'amountOriginal' | 'needsReview'>>,
): ExpenseDraft {
  return { ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) };
}

// 대상 인원 안에서만 지정한다. 빈 배열 = 대상 인원 전원.
export function setAssignees(d: ExpenseDraft, itemId: string, memberIds: string[]): ExpenseDraft {
  const ids = memberIds.filter((id) => d.scopeMemberIds.includes(id));
  return { ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, assigneeMemberIds: ids } : it)) };
}

// "3,280" → 3280, 소수 3자리까지, 음수(할인) 허용. 형식이 틀리면 null.
export function parseAmountInput(text: string): number | null {
  const s = text.replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d{1,3})?$/.test(s)) return null;
  return Number(s);
}

// 미리보기 전용(확정은 save_expense). 청구액 > KRW > 환율 순. 원본 합계 ≤ 0이거나 환율이 없으면 null.
export function previewKrw(d: ExpenseDraft, ratePerUnit: number | null): { totalKrw: number; boxKrw: number[] } | null {
  const milli = d.items.reduce((a, it) => a + toMilli(it.amountOriginal), 0);
  if (milli <= 0) return null;
  const totalKrw = d.krwCharged ?? (d.currency === 'KRW' ? roundHalfAwayFromZero(fromMilli(milli))
    : ratePerUnit === null ? null : toKrwPreview(fromMilli(milli), ratePerUnit));
  if (totalKrw === null) return null;
  return { totalKrw, boxKrw: allocateLargestRemainder(totalKrw, d.items.map((it) => ({ position: it.position, amount: it.amountOriginal }))) };
}

export function toDupInput(d: ExpenseDraft, krwPreview: number | null): Omit<DupCandidate, 'id' | 'createdAt'> {
  return {
    merchant: d.merchant || null, paidLocalDate: d.paidLocalDate, paidLocalTime: d.paidLocalTime, currency: d.currency,
    amountOriginal: fromMilli(d.items.reduce((a, it) => a + toMilli(it.amountOriginal), 0)), krwAmount: krwPreview,
  };
}

// [합치기]: 기존 지출의 박스·지정은 그대로, 사진만 덧붙이고 승인 문자 청구액이 있으면 적용한다.
export function mergePayload(
  existing: SaveExpensePayload, d: ExpenseDraft, photos: NonNullable<SaveExpensePayload['photos']>,
): SaveExpensePayload {
  return { ...existing, photos: [...(existing.photos ?? []), ...photos], krw_charged: d.krwCharged ?? existing.krw_charged ?? null };
}

export function kstToday(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

// 사람 지정 시트의 "1인 ¥1,640"(미리보기). 원화 확정 분담은 서버가 한다.
export function perPersonOriginal(amountOriginal: number, n: number): number {
  return fromMilli(splitEvenly(toMilli(amountOriginal), n).perPerson);
}
