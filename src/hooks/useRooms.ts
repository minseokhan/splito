import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

export function useMyRooms() {
  return useQuery({ queryKey: ['rooms'], queryFn: api.myRooms });
}

export function useRoom(id: RoomId) {
  return useQuery({ queryKey: ['room', id], queryFn: () => api.room(id) });
}

export function useRoomPass(id: RoomId) {
  return useQuery({ queryKey: ['room', id, 'pass'], queryFn: () => api.roomPass(id) });
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

export function useUpdateRoom(id: RoomId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateRoom,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rooms'] });
      void qc.invalidateQueries({ queryKey: ['room', id] });
    },
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteRoom,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

// 링크가 재발급되므로 방(invite_token)도 같이 무효화한다.
export function useRemoveMember(id: RoomId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.removeMember,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room', id] }),
  });
}

export function useJoinRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.joinRoom,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useInvitePreview(token: string, enabled = true) {
  return useQuery({ queryKey: ['invite', token], queryFn: () => api.previewInvite(token), retry: false, enabled });
}

export function useResolveInviteCode() {
  return useMutation({ mutationFn: api.resolveInviteCode });
}

// 초대 시트(링크·QR·코드)가 쓴다. 7일이 지난 링크는 서버가 이 호출에서 새로 발급한다.
export function useCurrentInvite(roomId: RoomId) {
  return useQuery({ queryKey: ['room', roomId, 'invite'], queryFn: () => api.currentInvite(roomId) });
}
