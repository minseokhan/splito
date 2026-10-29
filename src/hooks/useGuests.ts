import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

// 게스트가 바뀌면 멤버 목록·정산(대표자 합산)·방 인원·방 활동이 달라진다.
function useGuestMutation<T, R>(roomId: RoomId, mutationFn: (input: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId, 'members'] });
      qc.invalidateQueries({ queryKey: ['room', roomId, 'balances'] });
      qc.invalidateQueries({ queryKey: ['room', roomId, 'events'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export const useAddGuest = (roomId: RoomId) => useGuestMutation(roomId, api.addGuest);
export const useUpdateGuest = (roomId: RoomId) => useGuestMutation(roomId, api.updateGuest);
export const useRemoveGuest = (roomId: RoomId) => useGuestMutation(roomId, api.removeGuest);
