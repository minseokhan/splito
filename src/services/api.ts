import { toUserError } from '@/lib/errors';
import type { Tables } from '@/types/database';
import type { MyRoom, RoomId, RoomMember, RoomStatus } from '@/types/domain';

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
};
