import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

export function useMyRooms() {
  return useQuery({ queryKey: ['rooms'], queryFn: api.myRooms });
}

export function useRoom(id: RoomId) {
  return useQuery({ queryKey: ['room', id], queryFn: () => api.room(id) });
}

export function useRoomMembers(id: RoomId) {
  return useQuery({ queryKey: ['room', id, 'members'], queryFn: () => api.roomMembers(id) });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createRoom,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useJoinRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.joinRoom,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({ queryKey: ['invite', token], queryFn: () => api.previewInvite(token), retry: false });
}
