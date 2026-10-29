import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { MemberId, RoomId } from '@/types/domain';

// 카드별 계좌. 원문 조회는 서버가 기록·한도를 걸므로 같은 키는 캐시로 재사용한다.
export function usePayoutAccount(roomId: RoomId, ownerMemberId: MemberId) {
  return useQuery({
    queryKey: ['payout', roomId, ownerMemberId],
    queryFn: () => api.getPayoutAccount(roomId, ownerMemberId),
  });
}

export function useRequestPayoutAccount(roomId: RoomId) {
  return useMutation({ mutationFn: (ownerMemberId: MemberId) => api.requestPayoutAccount(roomId, ownerMemberId) });
}

export function useSetPayoutAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.setPayoutAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payout'] }),
  });
}
