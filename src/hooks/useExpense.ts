import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { ExpenseId, MemberId, RoomId, SaveExpensePayload } from '@/types/domain';

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

// 정산 전 확인 단계(명세 4): 내 '나만 보기' 지출. feed 아래 키를 쓰지 않아 Realtime 무효화에 흔들리지 않는다.
export function useMyPrivateExpenses(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'privateExpenses'], queryFn: () => api.myPrivateExpenses(roomId) });
}

// 대상 인원만 바꿔 다시 저장한다. 공개 범위는 save_expense가 다시 판정한다(AI-12). version은 저장 직전에 읽는다.
// privateExpenses는 일부러 무효화하지 않는다. 저장하는 동안 목록이 줄면 확인 단계가 닫혀 버린다.
export function useSetExpenseScope(roomId: RoomId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: ExpenseId; scopeMemberIds: MemberId[] }) => {
      const { payload, version } = await api.expensePayload(v.id);
      await api.saveExpense({ ...payload, scope_member_ids: v.scopeMemberIds }, version);
    },
    onSuccess: () => {
      for (const queryKey of [['room', roomId, 'feed'], ['room', roomId, 'balances'], ['rooms']]) {
        qc.invalidateQueries({ queryKey });
      }
    },
  });
}
