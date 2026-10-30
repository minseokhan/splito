import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type CommentRow } from '@/services/api';
import type { ExpenseId, RoomId } from '@/types/domain';

// useRealtimeRoom의 comments 이벤트가 이 키를 무효화한다.
const key = (expenseId: ExpenseId) => ['expense', expenseId, 'comments'];

export function useComments(expenseId: ExpenseId) {
  return useQuery({ queryKey: key(expenseId), queryFn: () => api.comments(expenseId) });
}

type AddVars = { id: string; expenseId: ExpenseId; roomId: RoomId; authorId: string; body: string };

// 낙관적 업데이트는 댓글에만 쓴다(ARCHITECTURE §7). 실패하면 이전 목록으로 되돌린다.
export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AddVars) => api.addComment(v),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key(v.expenseId) });
      const prev = qc.getQueryData<CommentRow[]>(key(v.expenseId));
      const row: CommentRow = { id: v.id, authorId: v.authorId, body: v.body, createdAt: new Date().toISOString() };
      qc.setQueryData<CommentRow[]>(key(v.expenseId), (old = []) => [...old, row]);
      return { prev };
    },
    onError: (_err, v, ctx) => qc.setQueryData(key(v.expenseId), ctx?.prev),
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: key(v.expenseId) }),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; expenseId: ExpenseId }) => api.deleteComment(v.id),
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: key(v.expenseId) }),
  });
}
