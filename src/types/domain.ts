import type { CategoryCode } from '../lib/category';

export type MemberId = string;
export type RoomId = string;
export type ExpenseId = string;

export type Krw = number; // 원 단위 정수

export type RoomStatus = 'settled' | 'settling' | 'shared' | 'solo';
export type FxSource = 'kexim' | 'card_krw' | 'krw' | 'manual' | 'pending';
export type ExpenseSource = 'receipt' | 'card_text' | 'card_image' | 'voice' | 'manual';

export type BalanceRow = {
  memberId: MemberId;
  kind: 'user' | 'guest';
  representativeMemberId: MemberId | null;
  joinedAt: string;
  leftAt: string | null;
  paid: Krw;
  owed: Krw;
  net: Krw;
};

// save_expense(p_payload) 형태. DB 키 그대로 둔다.
export type SaveExpensePayload = {
  id: ExpenseId; // 클라이언트 UUID(request_id 겸용)
  room_id: RoomId;
  payer_kind: 'member' | 'pool';
  payer_member_id: MemberId | null;
  source: ExpenseSource;
  merchant: string | null;
  paid_local_date: string; // YYYY-MM-DD
  paid_local_time?: string | null; // HH:MM[:SS]
  currency: string;
  krw_charged?: Krw | null;
  manual_rate?: number | null;
  card_last4?: string | null;
  needs_review?: boolean;
  ai_result?: unknown;
  category?: CategoryCode | null;
  scope_member_ids: MemberId[];
  items: {
    id: string;
    position: number;
    name_original?: string;
    name_ko?: string | null;
    quantity?: number;
    amount_original: number; // 외화 원본(numeric(18,3)), 원화 아님
    needs_review?: boolean;
    is_adjustment?: boolean;
    assignee_member_ids?: MemberId[];
  }[];
  photos?: { storage_path: string; kind: 'receipt' | 'capture' }[];
};

export type MyRoom = {
  roomId: RoomId;
  name: string;
  baseCurrency: string;
  startDate: string | null;
  endDate: string | null;
  status: RoomStatus;
  memberCount: number;
  myNet: Krw;
  totalKrw: Krw;
};

export type RoomMember = {
  id: MemberId;
  kind: 'user' | 'guest';
  userId: string | null;
  name: string; // user는 닉네임, guest는 guest_name
  avatarUrl: string | null;
  representativeMemberId: MemberId | null;
  joinedAt: string;
  leftAt: string | null;
};
