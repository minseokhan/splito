import { useQuery } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

// useRealtimeRoom의 room_events 이벤트가 이 키를 무효화한다.
export function useRoomEvents(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'events'], queryFn: () => api.roomEvents(roomId) });
}
