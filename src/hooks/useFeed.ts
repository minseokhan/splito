import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type FeedRow } from '@/services/api';
import type { RoomId } from '@/types/domain';

export function useFeed(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'feed'], queryFn: () => api.feed(roomId) });
}

// 환율 대기 지출의 (결제일, 통화)마다 fx-rate로 캐시를 채운 뒤 서버가 재확정한다. 조회 실패는 대기로 남는다.
export function useReconfirmPendingFx(roomId: RoomId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pending: FeedRow[]) => {
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
