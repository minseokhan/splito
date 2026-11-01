import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { visibleToMe } from '@/lib/feed';
import { api, type FeedRow } from '@/services/api';
import type { RoomId } from '@/types/domain';

// 남의 '나만 보기' 지출은 RLS가 이미 걸러내지만(AI-12) 조회 결과에서 한 번 더 뺀다(AI-15).
// 계정이 바뀌면 이전 사용자의 캐시를 보여주지 않도록 키에 내 id를 넣는다.
// 홈 '최근 기록'(useRecentExpenses)과 캐시를 공유하므로 키·필터를 여기서만 만든다.
export const feedQuery = (roomId: RoomId, myUserId: string | undefined) => ({
  queryKey: ['room', roomId, 'feed', myUserId],
  queryFn: async () => visibleToMe(await api.feed(roomId), myUserId),
});

export function useFeed(roomId: RoomId) {
  return useQuery(feedQuery(roomId, useAuth().session?.user.id));
}

// 환율 대기 지출의 (결제일, 통화)마다 fx-rate로 캐시를 채운 뒤 서버가 재확정한다. 조회 실패는 대기로 남는다.
export function useReconfirmPendingFx(roomId: RoomId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pending: Pick<FeedRow, 'paidLocalDate' | 'currency'>[]) => {
      const keys = [...new Set(pending.map((r) => `${r.paidLocalDate}|${r.currency}`))];
      await Promise.allSettled(keys.map((k) => api.fxRate(...(k.split('|') as [string, string]))));
      return api.reconfirmPendingFx(roomId);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
