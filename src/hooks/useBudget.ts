import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

// 내 통계(my-stats-spec). 예산·코칭·집계는 전부 본인 것만 본다.
export function useMyShares(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'shares'], queryFn: () => api.myExpenseShares(roomId) });
}

export function useMyBudget(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'budget'], queryFn: () => api.myBudget(roomId) });
}

export function useSaveBudget(roomId: RoomId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.saveBudget,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room', roomId, 'budget'] }),
  });
}

export function useApplyBudgetPlan(roomId: RoomId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.applyBudgetPlan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room', roomId, 'budget'] }),
  });
}
