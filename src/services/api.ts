import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import type { DupCandidate } from '@/lib/duplicate';
import { toUserError } from '@/lib/errors';
import type { ParseResult } from '@/lib/expenseForm';
import type { Json, Tables } from '@/types/database';
import type { MyRoom, RoomId, RoomMember, RoomStatus, SaveExpensePayload } from '@/types/domain';

import { supabase } from './supabase';

export type Room = Tables<'rooms'>;

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

  async ackAiNotice(): Promise<void> {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) throw toUserError({ status: 401 });
    unwrap(await supabase.from('profiles').update({ ai_notice_ack_at: new Date().toISOString() }).eq('id', uid));
  },
};
