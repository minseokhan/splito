import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/services/supabase';
import type { RoomId } from '@/types/domain';

type Row = Record<string, unknown>;

// 방 채널 하나로 6+1개 테이블을 듣고, 이벤트는 쿼리 무효화에만 쓴다(ARCHITECTURE §6.4).
export function useRealtimeRoom(roomId: RoomId) {
  const qc = useQueryClient();

  useEffect(() => {
    const invalidate = (...keys: QueryKey[]) => keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    const invalidateRoom = () => invalidate(['room', roomId]);

    const roomKeys: Record<string, (row: Row) => QueryKey[]> = {
      expenses: (r) => [['room', roomId, 'feed'], ['room', roomId, 'balances'], ['expense', r.id], ['rooms']],
      comments: (r) => [['expense', r.expense_id, 'comments']],
      room_members: () => [['room', roomId, 'members'], ['room', roomId, 'balances'], ['rooms']],
      transfers: () => [['room', roomId, 'transfers'], ['room', roomId, 'balances'], ['rooms']],
      pool_deposits: () => [['room', roomId, 'pool'], ['room', roomId, 'balances'], ['rooms']],
      room_events: () => [['room', roomId, 'events']],
    };

    const channel = supabase.channel(`room:${roomId}`);
    for (const [table, keys] of Object.entries(roomKeys)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `room_id=eq.${roomId}` }, (p) => {
        // DELETE는 new가 비어 있다(하드 삭제는 쓰지 않지만 방어).
        const row = (Object.keys(p.new).length ? p.new : p.old) as Row;
        invalidate(...keys(row));
      });
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
      qc.invalidateQueries({ queryKey: ['room', roomId], exact: true });
      invalidate(['rooms']);
    });

    // 끊긴 동안의 이벤트는 다시 오지 않으므로 재구독되면 방 쿼리 전체를 무효화한다(ADR-002).
    let subscribedOnce = false;
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (subscribedOnce) invalidateRoom();
      subscribedOnce = true;
    });

    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') invalidateRoom();
    });

    return () => {
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [qc, roomId]);
}
