import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { ExpenseId, RoomId, SaveExpensePayload } from '@/types/domain';

export function useExpense(id: ExpenseId) {
  return useQuery({ queryKey: ['expense', id], queryFn: () => api.expense(id) });
}

export function useExpenseHistory(id: ExpenseId) {
  return useQuery({ queryKey: ['expense', id, 'history'], queryFn: () => api.expenseHistory(id) });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { roomId: RoomId; id: ExpenseId; expectedVersion: number }) => api.deleteExpense(v.id, v.expectedVersion),
    onSuccess: (_, v) => {
      for (const queryKey of [['room', v.roomId, 'feed'], ['room', v.roomId, 'balances'], ['expense', v.id], ['rooms']]) {
        qc.invalidateQueries({ queryKey });
      }
    },
  });
}

// [수정] 저장. 작성 중 지출(AsyncStorage)과 무관하므로 useSaveExpense(clearDraft)를 쓰지 않는다.
export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { payload: SaveExpensePayload; expectedVersion: number }) => api.saveExpense(v.payload, v.expectedVersion),
    onSuccess: (_, v) => {
      for (const queryKey of [['room', v.payload.room_id], ['expense', v.payload.id], ['rooms']]) {
        qc.invalidateQueries({ queryKey });
      }
    },
  });
}
