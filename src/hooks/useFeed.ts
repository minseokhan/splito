import { useQuery } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

export function useFeed(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'feed'], queryFn: () => api.feed(roomId) });
}
