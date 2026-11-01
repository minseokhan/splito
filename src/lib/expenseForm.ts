// 인식 결과 → 작성 중 지출(draft) → save_expense payload. 원화는 넣지 않는다(서버가 확정, ADR-006).
import { addDays } from './calendar';
import { toCategory, type CategoryCode } from './category';
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
  category: string | null;
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
  cardLast4: string | null; category: CategoryCode; items: DraftItem[];
  photos: { storagePath: string; kind: 'receipt' | 'capture' }[]; needsReview: boolean; aiResult: unknown;
};

type Ctx = {
  expenseId: string; roomId: string; source: ExpenseSource; meMemberId: string;
  todayLocal: string; newId: () => string;
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
    category: toCategory(parse.category),
    items, photos: [],
    // 연도 보정은 parse-expense가 confidence low로 표시한다.
    needsReview: parse.confidence === 'low' || parse.currency_ambiguous || parse.paid_local_date === null || parse.currency === null,
    aiResult: parse,
  };
}

// 직접 입력·음성: 결제일 = 오늘(현지), 통화 = 방 기본 통화. 박스 지정은 빈 상태로 시작한다(= 전원 1/N).
export function emptyDraft(ctx: Ctx & { currency: string }): ExpenseDraft {
  return {
    id: ctx.expenseId, roomId: ctx.roomId, source: ctx.source,
    payerKind: 'member', payerMemberId: ctx.meMemberId,
    merchant: '', paidLocalDate: ctx.todayLocal, paidLocalTime: null, currency: ctx.currency,
    krwCharged: null, cardLast4: null, category: 'other',
    items: [item(ctx.newId(), 0)], photos: [], needsReview: false, aiResult: null,
  };
}

// [수정]: 저장된 지출(api.expensePayload) → 편집용 draft. 박스 id를 유지해야 save_expense가 같은 박스로 갱신한다.
export function draftFromExpense(p: SaveExpensePayload): ExpenseDraft {
  return {
    id: p.id, roomId: p.room_id, source: p.source, payerKind: p.payer_kind, payerMemberId: p.payer_member_id,
    merchant: p.merchant ?? '', paidLocalDate: p.paid_local_date, paidLocalTime: p.paid_local_time ?? null,
    currency: p.currency, krwCharged: p.krw_charged ?? null, cardLast4: p.card_last4 ?? null,
    category: toCategory(p.category),
    items: p.items.map((it) => item(it.id, it.position, {
      nameOriginal: it.name_original ?? '', nameKo: it.name_ko ?? '', quantity: it.quantity ?? 1,
      amountOriginal: it.amount_original, needsReview: it.needs_review ?? false, isAdjustment: it.is_adjustment ?? false,
      assigneeMemberIds: [...(it.assignee_member_ids ?? [])],
    })),
    photos: (p.photos ?? []).map((ph) => ({ storagePath: ph.storage_path, kind: ph.kind })),
    needsReview: p.needs_review ?? false, aiResult: p.ai_result ?? null,
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

export function validateDraft(d: ExpenseDraft, todayKst: string):
  { ok: true } | { ok: false; code: 'AMOUNT_INVALID' | 'DATE_IN_FUTURE' | 'INVALID_INPUT'; field?: string } {
  if (!/^[A-Z]{3}$/.test(d.currency)) return { ok: false, code: 'INVALID_INPUT', field: 'currency' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.paidLocalDate)) return { ok: false, code: 'INVALID_INPUT', field: 'paidLocalDate' };
  if (d.cardLast4 !== null && !/^\d{4}$/.test(d.cardLast4)) return { ok: false, code: 'INVALID_INPUT', field: 'cardLast4' };
  if (d.payerKind === 'member' && !d.payerMemberId) return { ok: false, code: 'INVALID_INPUT', field: 'payer' };
  if (d.items.reduce((a, it) => a + toMilli(it.amountOriginal), 0) <= 0) return { ok: false, code: 'AMOUNT_INVALID', field: 'items' };
  if (d.krwCharged !== null && d.krwCharged <= 0) return { ok: false, code: 'AMOUNT_INVALID', field: 'krwCharged' };
  if (d.paidLocalDate > addDays(todayKst, 1)) return { ok: false, code: 'DATE_IN_FUTURE', field: 'paidLocalDate' };
  return { ok: true };
}

// scope는 draft에 두지 않고 저장 시점에 박스 지정의 합집합으로 만든다.
// 빈 지정은 '전원 1/N'이라 그 박스는 활동 참여자 전원을 보탠다(0명으로 세면 전원 1/N이
// 남은 몇 명 몫으로 줄고, 결제자가 나일 때 지출 전체가 나만 보기로 뒤집힌다).
// 서버는 scope 0명을 거부하므로(SCOPE_EMPTY) 참여자 목록까지 비면 마지막으로 나 혼자로 채운다.
function effScope(d: ExpenseDraft, meMemberId: string | null, activeMemberIds: string[]): string[] {
  const union = [
    ...new Set(d.items.flatMap((it) => (it.assigneeMemberIds.length ? it.assigneeMemberIds : activeMemberIds))),
  ];
  if (union.length > 0) return union;
  return meMemberId ? [meMemberId] : [];
}

// 공개 범위는 save_expense가 판정한다. 아래는 같은 규칙의 화면 표시용 미리보기.
// ponytail: 남이 만든 지출을 편집하는 경우(서버는 shared 유지)는 draft에 created_by가 없어 구분하지 않는다.
export function previewVisibility(d: ExpenseDraft, meMemberId: string | null, activeMemberIds: string[]): 'shared' | 'private' {
  const scope = effScope(d, meMemberId, activeMemberIds);
  return d.payerKind === 'member' && d.payerMemberId === meMemberId && scope.length === 1 && scope[0] === meMemberId
    ? 'private'
    : 'shared';
}

export function toSavePayload(d: ExpenseDraft, meMemberId: string | null, activeMemberIds: string[]): SaveExpensePayload {
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
    category: d.category,
    scope_member_ids: effScope(d, meMemberId, activeMemberIds),
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

// 박스별 먹은 사람. 빈 배열 = 활동 중인 참여자 전원 1/N.
export function setAssignees(d: ExpenseDraft, itemId: string, memberIds: string[]): ExpenseDraft {
  return { ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, assigneeMemberIds: memberIds } : it)) };
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
