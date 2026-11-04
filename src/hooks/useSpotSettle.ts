import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

// 일정 카드의 상태 줄이 쓰는 방 전체 목록. QR 참여는 앱 밖(웹)에서 일어나므로
// 시트가 열려 있는 동안에는 짧게 다시 묻는다 — 실시간 구독까지는 필요 없다.
export const useRoomSpotSettles = (roomId: RoomId, live = false) =>
  useQuery({
    queryKey: ['room', roomId, 'spot'],
    queryFn: () => api.roomSpotSettles(roomId),
    refetchInterval: live ? 4000 : false,
  });

// 정산 하나가 바뀌면 목록·피드·정산 결과가 같이 달라진다
// (대상 인원과 송금이 바뀌므로 순잔액이 움직인다).
function useSpotMutation<T, R>(roomId: RoomId, mutationFn: (input: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId, 'spot'] });
      qc.invalidateQueries({ queryKey: ['room', roomId, 'feed'] });
      qc.invalidateQueries({ queryKey: ['room', roomId, 'balances'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export const useOpenSpotSettle = (roomId: RoomId) => useSpotMutation(roomId, api.openSpotSettle);
export const useSendSpotSettle = (roomId: RoomId) => useSpotMutation(roomId, api.sendSpotSettle);
export const useConfirmSpotTransfer = (roomId: RoomId) => useSpotMutation(roomId, api.confirmSpotTransfer);
