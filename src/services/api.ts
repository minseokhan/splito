import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import type { DupCandidate } from '@/lib/duplicate';
import { toUserError } from '@/lib/errors';
import type { ParseResult } from '@/lib/expenseForm';
import type { RoomEvent } from '@/lib/activity';
import type { Snapshot } from '@/lib/history';
import type { TransferRecord } from '@/lib/settleView';
import type { Json, Tables } from '@/types/database';
import type { BalanceRow, ExpenseId, FxSource, Krw, MemberId, MyRoom, RoomId, RoomMember, RoomStatus, SaveExpensePayload } from '@/types/domain';

import { supabase } from './supabase';

export type Room = Tables<'rooms'>;

// 피드 한 줄. 박스는 상세에서만 읽는다. 결제자(참여자 ID)·기록자(profile ID) 이름은 멤버 목록으로 붙인다.
export type FeedRow = {
  id: ExpenseId;
  merchant: string | null;
  paidLocalDate: string;
  paidLocalTime: string | null;
  createdAt: string;
  currency: string;
  amountOriginal: number;
  krwAmount: number | null;
  fxSource: FxSource;
  source: string;
  payerKind: 'member' | 'pool';
  payerMemberId: MemberId | null;
  createdBy: string | null;
  needsReview: boolean;
};

// 복합 FK 임베드는 생성 타입이 추론하지 못해 행 타입을 직접 적는다.
export type ExpenseDetail = Tables<'expenses'> & {
  expense_items: (Tables<'expense_items'> & { item_assignees: { member_id: string }[] })[];
  expense_scope: { member_id: string }[];
  expense_photos: { storage_path: string; kind: string }[];
};

export type HistoryRow = {
  id: string;
  action: string;
  actorId: string | null;
  actorNickname: string | null;
  at: string;
  snapshot: Snapshot;
};

export type CommentRow = { id: string; authorId: string; body: string; createdAt: string };

export type PayoutAccount = {
  registered: boolean;
  bankName: string | null;
  holderName: string | null;
  accountMasked: string | null;
  accountNumber: string | null; // 본인이거나 내가 줄 돈이 있을 때만 원문
};

export type InvitePreview = {
  roomId: RoomId;
  roomName: string;
  inviterNickname: string;
  memberCount: number;
  alreadyMember: boolean;
};

// supabase 응답의 error를 사용자 에러로 바꿔 throw한다.
function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw toUserError(error);
  return data as T; // error가 없으면 data가 있다
}

export type FxRateResult =
  | { base_date: string; rate: number; source: 'kexim' | 'krw' }
  | { status: 'pending' | 'unsupported' };

const PARSE_TIMEOUT_MS = 30_000;

// Edge Function 에러를 사용자 에러로 바꾼다. 본문은 {error:{code}}(_shared/http.ts).
async function functionError(error: unknown): Promise<unknown> {
  if (error instanceof FunctionsHttpError) {
    const body = await (error.context as Response).json().catch(() => null);
    return toUserError(body ?? { status: (error.context as Response).status });
  }
  if (error instanceof FunctionsFetchError) {
    const cause = error.context as { name?: string } | undefined;
    return cause?.name === 'AbortError' ? toUserError({ message: 'PARSE_TIMEOUT' }) : toUserError(cause);
  }
  return toUserError(error);
}

export const api = {
  async createRoom(input: { name: string; baseCurrency: string; startDate?: string; endDate?: string }): Promise<RoomId> {
    return unwrap(
      await supabase.rpc('create_room', {
        p_name: input.name,
        p_base_currency: input.baseCurrency,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
      }),
    );
  },

  async previewInvite(token: string): Promise<InvitePreview> {
    const r = unwrap(await supabase.rpc('preview_invite', { p_token: token })) as {
      room_id: string;
      room_name: string;
      inviter_nickname: string | null;
      member_count: number;
      already_member: boolean;
    };
    return {
      roomId: r.room_id,
      roomName: r.room_name,
      inviterNickname: r.inviter_nickname ?? '',
      memberCount: r.member_count,
      alreadyMember: r.already_member,
    };
  },

  async joinRoom(token: string): Promise<RoomId> {
    return unwrap(await supabase.rpc('join_room', { p_token: token }));
  },

  async myRooms(): Promise<MyRoom[]> {
    const rows = unwrap(await supabase.rpc('my_rooms'));
    return rows.map((r) => ({
      roomId: r.room_id,
      name: r.name,
      baseCurrency: r.base_currency,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status as RoomStatus,
      memberCount: r.member_count,
      myNet: r.my_net,
      totalKrw: r.total_krw,
    }));
  },

  // member_profiles 뷰에는 FK가 없어 임베드할 수 없으므로 두 번 조회해 합친다.
  async roomMembers(roomId: RoomId): Promise<RoomMember[]> {
    const members = unwrap(
      await supabase.from('room_members').select('*').eq('room_id', roomId).order('joined_at').order('id'),
    );
    const userIds = members.flatMap((m) => (m.user_id ? [m.user_id] : []));
    const profiles = userIds.length
      ? unwrap(await supabase.from('member_profiles').select('*').in('id', userIds))
      : [];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return members.map((m) => {
      const p = m.user_id ? byId.get(m.user_id) : undefined;
      return {
        id: m.id,
        kind: m.kind as RoomMember['kind'],
        userId: m.user_id,
        name: m.guest_name ?? p?.nickname ?? '탈퇴한 사용자',
        avatarUrl: p?.avatar_url ?? null,
        representativeMemberId: m.representative_member_id,
        joinedAt: m.joined_at,
        leftAt: m.left_at,
      };
    });
  },

  async room(roomId: RoomId): Promise<Room> {
    return unwrap(await supabase.from('rooms').select('*').eq('id', roomId).single());
  },

  // 비용 때문에 자동 재시도하지 않는다(ARCHITECTURE §5.2). 사용자가 signal로 취소하면 원래 에러를 그대로 던진다.
  async parseExpense(
    req: { roomId: RoomId; kind: 'image' | 'text'; storagePath?: string; text?: string; baseCurrency: string; roomStartDate?: string },
    signal?: AbortSignal,
  ): Promise<ParseResult> {
    const { data, error } = await supabase.functions.invoke<ParseResult>('parse-expense', {
      body: {
        room_id: req.roomId,
        kind: req.kind,
        storage_path: req.storagePath,
        text: req.text,
        base_currency: req.baseCurrency,
        room_start_date: req.roomStartDate,
      },
      signal,
      timeout: PARSE_TIMEOUT_MS,
    });
    if (error) throw signal?.aborted ? error : await functionError(error);
    return data!;
  },

  async fxRate(date: string, currency: string): Promise<FxRateResult> {
    const { data, error } = await supabase.functions.invoke<FxRateResult>('fx-rate', { body: { date, currency } });
    if (error) throw await functionError(error);
    return data!;
  },

  async saveExpense(payload: SaveExpensePayload, expectedVersion: number | null): Promise<{ id: string; version: number }> {
    const r = unwrap(
      await supabase.rpc('save_expense', {
        p_payload: payload as unknown as Json,
        p_expected_version: expectedVersion ?? undefined,
      }),
    ) as { id: string; version: number };
    return { id: r.id, version: r.version };
  },

  // 중복 감지용: sinceIso 이후에 기록된 활성 지출(lib/duplicate는 72시간 창을 쓴다).
  async recentExpenses(roomId: RoomId, sinceIso: string): Promise<DupCandidate[]> {
    const rows = unwrap(
      await supabase
        .from('expenses')
        .select('id, merchant, paid_local_date, paid_local_time, currency, amount_original, krw_amount, created_at')
        .eq('room_id', roomId)
        .is('deleted_at', null)
        .gte('created_at', sinceIso),
    );
    return rows.map((r) => ({
      id: r.id,
      merchant: r.merchant,
      paidLocalDate: r.paid_local_date,
      paidLocalTime: r.paid_local_time,
      currency: r.currency,
      amountOriginal: Number(r.amount_original),
      krwAmount: r.krw_amount,
      createdAt: r.created_at,
    }));
  },

  async feed(roomId: RoomId): Promise<FeedRow[]> {
    const rows = unwrap(
      await supabase
        .from('expenses')
        .select(
          'id, merchant, paid_local_date, paid_local_time, created_at, currency, amount_original, krw_amount, fx_source, source, payer_kind, payer_member_id, created_by, needs_review',
        )
        .eq('room_id', roomId)
        .is('deleted_at', null)
        .order('paid_local_date', { ascending: false })
        .order('created_at', { ascending: false }),
    );
    return rows.map((r) => ({
      id: r.id,
      merchant: r.merchant,
      paidLocalDate: r.paid_local_date,
      paidLocalTime: r.paid_local_time,
      createdAt: r.created_at,
      currency: r.currency,
      amountOriginal: Number(r.amount_original),
      krwAmount: r.krw_amount,
      fxSource: r.fx_source as FxSource,
      source: r.source,
      payerKind: r.payer_kind as FeedRow['payerKind'],
      payerMemberId: r.payer_member_id,
      createdBy: r.created_by,
      needsReview: r.needs_review,
    }));
  },

  async expense(id: ExpenseId): Promise<ExpenseDetail> {
    return unwrap<ExpenseDetail>(
      await supabase
        .from('expenses')
        .select('*, expense_items(*, item_assignees(member_id)), expense_scope(member_id), expense_photos(storage_path, kind)')
        .eq('id', id)
        .is('deleted_at', null)
        .order('position', { referencedTable: 'expense_items' })
        .single()
        .overrideTypes<ExpenseDetail, { merge: false }>(),
    );
  },

  async expenseHistory(id: ExpenseId): Promise<HistoryRow[]> {
    const rows = unwrap(await supabase.rpc('expense_history', { p_expense_id: id })) as {
      id: string;
      action: string;
      actor_id: string | null;
      actor_nickname: string | null;
      at: string;
      snapshot: Snapshot;
    }[];
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorId: r.actor_id,
      actorNickname: r.actor_nickname,
      at: r.at,
      snapshot: r.snapshot,
    }));
  },

  // 방 활동 시스템 메시지. INSERT는 RPC 안에서만 한다(ARCHITECTURE §3). 최근 200건만 읽는다.
  async roomEvents(roomId: RoomId): Promise<RoomEvent[]> {
    const rows = unwrap(
      await supabase
        .from('room_events')
        .select('id, kind, actor_id, target_member_id, payload, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(200),
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as RoomEvent['kind'],
      actorId: r.actor_id,
      targetMemberId: r.target_member_id,
      payload: r.payload as Record<string, unknown>,
      createdAt: r.created_at,
    }));
  },

  // 소프트 삭제된 댓글은 숨긴다. 작성자 이름은 멤버 목록(userId)으로 붙인다.
  async comments(expenseId: ExpenseId): Promise<CommentRow[]> {
    const rows = unwrap(
      await supabase.from('comments').select('id, author_id, body, created_at').eq('expense_id', expenseId).is('deleted_at', null).order('created_at'),
    );
    return rows.map((r) => ({ id: r.id, authorId: r.author_id, body: r.body, createdAt: r.created_at }));
  },

  // comments는 직접 INSERT 예외(ARCHITECTURE §4). RLS가 author_id = 본인·방 멤버를 강제한다. id는 클라이언트 UUID.
  async addComment(input: { id: string; expenseId: ExpenseId; roomId: RoomId; authorId: string; body: string }): Promise<void> {
    unwrap(
      await supabase
        .from('comments')
        .insert({ id: input.id, expense_id: input.expenseId, room_id: input.roomId, author_id: input.authorId, body: input.body }),
    );
  },

  // RLS가 본인 행만 고치게 한다. 남의 댓글이면 0행이라 조용히 끝난다.
  async deleteComment(id: string): Promise<void> {
    unwrap(await supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  },

  async deleteExpense(id: ExpenseId, expectedVersion: number): Promise<void> {
    unwrap(await supabase.rpc('delete_expense', { p_id: id, p_expected_version: expectedVersion }));
  },

  // 확정된 건수를 돌려준다. 호출 전에 fx-rate로 캐시를 채운다(ARCHITECTURE §5.1).
  async reconfirmPendingFx(roomId: RoomId): Promise<number> {
    return unwrap(await supabase.rpc('reconfirm_pending_fx', { p_room_id: roomId }));
  },

  // [합치기]용: 저장된 지출을 save_expense payload 형태로 다시 읽는다(원화는 서버 값이라 넣지 않는다).
  async expensePayload(id: string): Promise<{ payload: SaveExpensePayload; version: number }> {
    const e = await api.expense(id);
    return {
      version: e.version,
      payload: {
        id: e.id,
        room_id: e.room_id,
        payer_kind: e.payer_kind as SaveExpensePayload['payer_kind'],
        payer_member_id: e.payer_member_id,
        source: e.source as SaveExpensePayload['source'],
        merchant: e.merchant,
        paid_local_date: e.paid_local_date,
        paid_local_time: e.paid_local_time,
        currency: e.currency,
        krw_charged: e.krw_charged,
        // 수동 환율로 확정된 지출은 같은 환율을 다시 보내야 재확정되지 않는다.
        manual_rate: e.fx_source === 'manual' ? Number(e.fx_rate) : null,
        card_last4: e.card_last4,
        needs_review: e.needs_review,
        ai_result: e.ai_result,
        scope_member_ids: e.expense_scope.map((s) => s.member_id),
        items: e.expense_items.map((it) => ({
          id: it.id,
          position: it.position,
          name_original: it.name_original,
          name_ko: it.name_ko,
          quantity: Number(it.quantity),
          amount_original: Number(it.amount_original),
          needs_review: it.needs_review,
          is_adjustment: it.is_adjustment,
          assignee_member_ids: it.item_assignees.map((a) => a.member_id),
        })),
        photos: e.expense_photos.map((p) => ({ storage_path: p.storage_path, kind: p.kind as 'receipt' | 'capture' })),
      },
    };
  },

  // 순잔액의 유일한 정답(ADR-007). fx_pending_count는 모든 행에 같은 값이 실린다.
  async roomBalances(roomId: RoomId, confirmedOnly = false): Promise<{ rows: BalanceRow[]; fxPendingCount: number }> {
    const rows = unwrap(await supabase.rpc('room_balances', { p_room_id: roomId, p_confirmed_only: confirmedOnly }));
    return {
      fxPendingCount: rows[0]?.fx_pending_count ?? 0,
      rows: rows.map((r) => ({
        memberId: r.member_id,
        kind: r.kind as BalanceRow['kind'],
        representativeMemberId: r.representative_member_id,
        joinedAt: r.joined_at,
        leftAt: r.left_at,
        paid: r.paid,
        owed: r.owed,
        net: r.net,
      })),
    };
  },

  // expenses에는 updated_at이 없어 이력의 마지막 시각을 장부 변경 시각으로 쓴다.
  async lastExpenseChangeAt(roomId: RoomId): Promise<string | null> {
    const rows = unwrap(
      await supabase.from('expense_history').select('at').eq('room_id', roomId).order('at', { ascending: false }).limit(1),
    );
    return rows[0]?.at ?? null;
  },

  async transfers(roomId: RoomId): Promise<TransferRecord[]> {
    const rows = unwrap(
      await supabase
        .from('transfers')
        .select('id, from_member_id, to_member_id, amount_krw, confirmed_at, voided_at, void_reason, created_at')
        .eq('room_id', roomId)
        .order('created_at'),
    );
    return rows.map((r) => ({
      id: r.id,
      from: r.from_member_id,
      to: r.to_member_id,
      amount: r.amount_krw,
      confirmedAt: r.confirmed_at,
      voidedAt: r.voided_at,
      voidReason: r.void_reason as TransferRecord['voidReason'],
      createdAt: r.created_at,
    }));
  },

  // id는 클라이언트 UUID라 같은 요청을 다시 보내도 1건만 남는다.
  async recordTransfer(input: { id: string; roomId: RoomId; from: MemberId; to: MemberId; amount: Krw }): Promise<void> {
    unwrap(
      await supabase.rpc('record_transfer', {
        p_id: input.id,
        p_room_id: input.roomId,
        p_from_member_id: input.from,
        p_to_member_id: input.to,
        p_amount_krw: input.amount,
      }),
    );
  },

  async confirmTransfer(id: string): Promise<void> {
    unwrap(await supabase.rpc('confirm_transfer', { p_id: id }));
  },

  async rejectTransfer(id: string): Promise<void> {
    unwrap(await supabase.rpc('reject_transfer', { p_id: id }));
  },

  async cancelTransfer(id: string): Promise<void> {
    unwrap(await supabase.rpc('cancel_transfer', { p_id: id }));
  },

  async setPayoutAccount(input: { bankCode: string; bankName: string; holderName: string; accountNumber: string }): Promise<void> {
    unwrap(
      await supabase.rpc('set_payout_account', {
        p_bank_code: input.bankCode,
        p_bank_name: input.bankName,
        p_holder_name: input.holderName,
        p_account_number: input.accountNumber,
      }),
    );
  },

  // 내 계좌 요약. RLS가 본인 행만 보여준다. 원문은 암호문뿐이라 읽지 않는다.
  async myPayoutAccount(): Promise<{ bankCode: string; bankName: string; holderName: string; accountLast4: string } | null> {
    const { data: r, error } = await supabase.from('payout_accounts').select('bank_code, bank_name, holder_name, account_last4').maybeSingle();
    if (error) throw toUserError(error);
    return r && { bankCode: r.bank_code, bankName: r.bank_name, holderName: r.holder_name, accountLast4: r.account_last4 };
  },

  async getPayoutAccount(roomId: RoomId, ownerMemberId: MemberId): Promise<PayoutAccount> {
    const [r] = unwrap(await supabase.rpc('get_payout_account', { p_room_id: roomId, p_owner_member_id: ownerMemberId }));
    return {
      registered: r?.registered ?? false,
      bankName: r?.bank_name ?? null,
      holderName: r?.holder_name ?? null,
      accountMasked: r?.account_masked ?? null,
      accountNumber: r?.account_number ?? null,
    };
  },

  async requestPayoutAccount(roomId: RoomId, ownerMemberId: MemberId): Promise<void> {
    unwrap(await supabase.rpc('request_payout_account', { p_room_id: roomId, p_owner_member_id: ownerMemberId }));
  },

  // 게스트(ADR-011). 대표자를 비우면 서버가 호출자로 정한다.
  async addGuest(input: { roomId: RoomId; name: string; representativeMemberId?: MemberId }): Promise<MemberId> {
    return unwrap(
      await supabase.rpc('add_guest', {
        p_room_id: input.roomId,
        p_name: input.name,
        p_representative_member_id: input.representativeMemberId,
      }),
    );
  },

  // 안 넘긴 값은 서버가 유지한다.
  async updateGuest(input: { memberId: MemberId; name?: string; representativeMemberId?: MemberId }): Promise<void> {
    unwrap(
      await supabase.rpc('update_guest', {
        p_member_id: input.memberId,
        p_name: input.name,
        p_representative_member_id: input.representativeMemberId,
      }),
    );
  },

  async removeGuest(memberId: MemberId): Promise<void> {
    unwrap(await supabase.rpc('remove_guest', { p_member_id: memberId }));
  },

  // 끌 때는 주인을 null로 보낸다(서버가 주인·카드를 비운다). 키를 빼면 함수 시그니처가 안 맞아 null을 그대로 보낸다.
  async setPool(input: { roomId: RoomId; enabled: boolean; ownerMemberId: MemberId | null; cardLast4: string[] }): Promise<void> {
    unwrap(
      await supabase.rpc('set_pool', {
        p_room_id: input.roomId,
        p_enabled: input.enabled,
        p_owner_member_id: input.ownerMemberId as string,
        p_card_last4: input.cardLast4,
      }),
    );
  },

  // 0원은 서버가 삭제한다(사람당 1행).
  async upsertPoolDeposits(input: { roomId: RoomId; rows: { memberId: MemberId; amountKrw: Krw }[] }): Promise<void> {
    unwrap(
      await supabase.rpc('upsert_pool_deposits', {
        p_room_id: input.roomId,
        p_rows: input.rows.map((r) => ({ member_id: r.memberId, amount_krw: r.amountKrw })),
      }),
    );
  },

  async poolDeposits(roomId: RoomId): Promise<{ memberId: MemberId; amountKrw: Krw }[]> {
    const rows = unwrap(await supabase.from('pool_deposits').select('member_id, amount_krw').eq('room_id', roomId));
    return rows.map((r) => ({ memberId: r.member_id, amountKrw: r.amount_krw }));
  },

  async ackAiNotice(): Promise<void> {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) throw toUserError({ status: 401 });
    unwrap(await supabase.from('profiles').update({ ai_notice_ack_at: new Date().toISOString() }).eq('id', uid));
  },
};
