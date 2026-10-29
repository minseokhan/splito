import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { matchTransfers } from '@/lib/matching';
import { buildCards } from '@/lib/settleView';
import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

import { useAuth } from './useAuth';
import { useRoomMembers } from './useRooms';

// 화면 순잔액: 확인 대기 송금까지 반영(confirmed_only=false). 완료·나가기 판정은 서버가 한다.
export function useBalances(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'balances'], queryFn: () => api.roomBalances(roomId) });
}

export function useTransfers(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'transfers'], queryFn: () => api.transfers(roomId) });
}

// room_balances → 그리디 매칭 → 내 카드 먼저(ARCHITECTURE §6.5).
export function useSettlePlan(roomId: RoomId) {
  const { session } = useAuth();
  const balances = useBalances(roomId);
  const { data: members } = useRoomMembers(roomId);
  const me = members?.find((m) => m.userId === session?.user.id && !m.leftAt);
  const rows = balances.data?.rows;
  const cards = useMemo(() => (rows && me ? buildCards(matchTransfers(rows), me.id) : undefined), [rows, me]);
  return { ...balances, me, cards };
}

// 낙관적 업데이트 없이 서버 응답 후 무효화만 한다(ARCHITECTURE §7).
function useTransferMutation<T>(roomId: RoomId, mutationFn: (input: T) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId, 'balances'] });
      qc.invalidateQueries({ queryKey: ['room', roomId, 'transfers'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export const useRecordTransfer = (roomId: RoomId) => useTransferMutation(roomId, api.recordTransfer);
export const useConfirmTransfer = (roomId: RoomId) => useTransferMutation(roomId, api.confirmTransfer);
export const useRejectTransfer = (roomId: RoomId) => useTransferMutation(roomId, api.rejectTransfer);
export const useCancelTransfer = (roomId: RoomId) => useTransferMutation(roomId, api.cancelTransfer);
