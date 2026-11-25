import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useFeed } from '@/hooks/useFeed';
import { poolRemaining } from '@/lib/pool';
import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

// 입금 목록. 공금 설정(켜짐·통장 주인·카드)은 rooms 행이라 useRoom으로 읽는다.
// Realtime: pool_deposits 이벤트 → ['room', id, 'pool'], rooms 이벤트 → ['room', id](useRealtimeRoom).
export function usePoolDeposits(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'pool'], queryFn: () => api.poolDeposits(roomId) });
}

// 공금은 통장 주인 순잔액·방 상태를 바꾼다. 서버 응답 후 무효화만 한다.
function usePoolMutation<T>(roomId: RoomId, mutationFn: (input: T) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export const useSetPool = (roomId: RoomId) => usePoolMutation(roomId, api.setPool);
export const useUpsertPoolDeposits = (roomId: RoomId) => usePoolMutation(roomId, api.upsertPoolDeposits);

// 공금 잔액(원). 입금 합계 − 원화 확정된 공금 결제(공금 지갑 화면과 같은 계산). 불러오는 중이면 null.
// excludeExpenseId: 편집 중인 지출은 빼고 센다(새 금액으로 다시 비교).
export function usePoolBalance(roomId: RoomId, excludeExpenseId?: string): number | null {
  const { data: deposits } = usePoolDeposits(roomId);
  const { data: feed } = useFeed(roomId);
  if (!deposits || !feed) return null;
  return poolRemaining(
    deposits.map((d) => d.amountKrw),
    feed.flatMap((r) => (r.payerKind === 'pool' && r.krwAmount !== null && r.id !== excludeExpenseId ? [r.krwAmount] : [])),
  );
}
