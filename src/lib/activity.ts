import { z } from 'zod';
import { groupFeed, type FeedSection } from './feed';
import { formatKrw } from './money';

export type RoomEvent = {
  id: string;
  kind:
    | 'join'
    | 'leave'
    | 'removed'
    | 'guest_added'
    | 'guest_rep_change'
    | 'owner_change'
    | 'pool_owner_change'
    | 'payout_reveal'
    | 'payout_request'
    | 'transfer';
  actorId: string | null;
  targetMemberId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

const GONE = '탈퇴한 사용자';

// names는 profiles id(actor)와 room_members id(target·payload)를 모두 담는다. 모르는 id는 탈퇴로 본다.
// 계좌번호 등 민감 정보는 문구에 넣지 않는다(PRD §7.3).
export function eventText(e: RoomEvent, names: Record<string, string>): string {
  const who = (id: unknown) => (typeof id === 'string' && names[id]) || GONE;
  const actor = who(e.actorId);
  const target = who(e.targetMemberId ?? e.actorId);
  switch (e.kind) {
    case 'join':
      return `${target} 님이 참여했어요`;
    case 'leave':
      return `${target} 님이 방을 나갔어요`;
    case 'removed':
      return `${actor} 님이 ${who(e.targetMemberId)} 님을 내보냈어요`;
    case 'guest_added':
      return `${actor} 님이 게스트 ${who(e.targetMemberId)} 님을 추가했어요`;
    case 'guest_rep_change':
      return `${who(e.targetMemberId)} 님의 대표자가 ${who(e.payload.representative_member_id)} 님으로 바뀌었어요`;
    case 'owner_change':
      return `방장이 ${who(e.targetMemberId)} 님으로 바뀌었어요`;
    case 'pool_owner_change':
      return `통장 주인이 ${who(e.targetMemberId)} 님으로 바뀌었어요`;
    case 'payout_reveal':
      return `${actor} 님이 정산을 위해 ${who(e.targetMemberId)} 님 계좌를 확인했어요`;
    case 'payout_request':
      return `${actor} 님이 ${who(e.targetMemberId)} 님께 계좌 등록을 요청했어요`;
    case 'transfer':
      return `${who(e.payload.from_member_id)} → ${who(e.payload.to_member_id)} ${formatKrw(Number(e.payload.amount_krw))} 보냈어요`;
  }
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDate(iso: string): string {
  return new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 이벤트를 KST 날짜를 결제일처럼 취급해 groupFeed에 태운 뒤 원래 객체로 되돌린다.
export function mergeActivity<T extends { createdAt: string; paidLocalDate: string }>(
  expenses: T[],
  events: RoomEvent[],
  roomStartDate: string | null,
): FeedSection<T | RoomEvent>[] {
  const rows = [
    ...expenses.map((item) => ({ paidLocalDate: item.paidLocalDate, createdAt: item.createdAt, item: item as T | RoomEvent })),
    ...events.map((item) => ({ paidLocalDate: kstDate(item.createdAt), createdAt: item.createdAt, item: item as T | RoomEvent })),
  ];
  return groupFeed(rows, roomStartDate).map((s) => ({ ...s, data: s.data.map((r) => r.item) }));
}

export const commentSchema = z.string().trim().min(1).max(500);
