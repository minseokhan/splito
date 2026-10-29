import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { ExpenseId, RoomId } from '@/types/domain';

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
