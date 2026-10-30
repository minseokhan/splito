import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/services/api';
import { clearDraft, loadDraft, saveDraft, type StoredDraft } from '@/services/drafts';
import type { RoomId, SaveExpensePayload } from '@/types/domain';

const SAVE_DEBOUNCE_MS = 500;

// 작성 중 지출 상태. 바뀔 때마다 500ms 디바운스로 기기에 저장한다.
export function useDraft(roomId: RoomId) {
  const [stored, setStored] = useState<StoredDraft | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadDraft(roomId).then((d) => {
      if (!alive) return;
      setStored(d);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!loaded || !stored) return;
    const t = setTimeout(() => void saveDraft(roomId, stored), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [roomId, loaded, stored]);

  return { stored, setStored, loaded };
}

export function useSaveExpense(roomId: RoomId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, expectedVersion }: { payload: SaveExpensePayload; expectedVersion: number | null }) =>
      api.saveExpense(payload, expectedVersion),
    onSuccess: async () => {
      await clearDraft(roomId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['room', roomId, 'feed'] }),
        qc.invalidateQueries({ queryKey: ['rooms'] }),
      ]);
    },
  });
}
