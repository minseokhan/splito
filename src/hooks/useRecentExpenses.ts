import { useQueries } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { feedQuery } from '@/hooks/useFeed';
import { api, type FeedRow } from '@/services/api';
import type { MyRoom } from '@/types/domain';

export type RecentExpense = FeedRow & { roomId: string; roomName: string; payerName: string };

// 홈 '최근 기록': 진행 중 여행별 피드·멤버를 기존 쿼리 키로 받아(상세 화면과 캐시 공유) 기록 시각 최신순으로 합친다.
// ponytail: 여행마다 피드 전체를 받는다. 여행 수가 많아지면 서버에 최근 N건 RPC를 둔다.
export function useRecentExpenses(rooms: MyRoom[], limit = 3) {
  const myId = useAuth().session?.user.id;
  const feeds = useQueries({ queries: rooms.map((r) => feedQuery(r.roomId, myId)) });
  const members = useQueries({
    queries: rooms.map((r) => ({ queryKey: ['room', r.roomId, 'members'], queryFn: () => api.roomMembers(r.roomId) })),
  });

  const rows: RecentExpense[] = rooms.flatMap((room, i) => {
    const names = new Map((members[i]?.data ?? []).map((m) => [m.id, m.name]));
    return (feeds[i]?.data ?? []).map((e) => ({
      ...e,
      roomId: room.roomId,
      roomName: room.name,
      payerName: e.payerKind === 'pool' ? '공금' : (names.get(e.payerMemberId ?? '') ?? ''),
    }));
  });
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    data: rows.slice(0, limit),
    refetch: () => Promise.all([...feeds, ...members].map((q) => q.refetch())),
  };
}
