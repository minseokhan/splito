import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import type { RoomId } from '@/types/domain';

export const useTripBooking = (roomId: RoomId) =>
  useQuery({ queryKey: ['room', roomId, 'booking'], queryFn: () => api.tripBooking(roomId) });

export const useScheduleItems = (roomId: RoomId) =>
  useQuery({ queryKey: ['room', roomId, 'schedule'], queryFn: () => api.scheduleItems(roomId) });

export const useHiddenSchedules = (roomId: RoomId) =>
  useQuery({ queryKey: ['room', roomId, 'schedule-hidden'], queryFn: () => api.hiddenScheduleIds(roomId) });

// 예약·일정이 바뀌면 일정 영역과 (지출 연결 때문에) 피드가 같이 달라진다.
function useScheduleMutation<T, R>(roomId: RoomId, mutationFn: (input: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId, 'booking'] });
      qc.invalidateQueries({ queryKey: ['room', roomId, 'schedule'] });
      qc.invalidateQueries({ queryKey: ['room', roomId, 'schedule-hidden'] });
      qc.invalidateQueries({ queryKey: ['room', roomId, 'feed'] });
    },
  });
}

export const useLinkBooking = (roomId: RoomId) => useScheduleMutation(roomId, api.linkBooking);
export const useRefetchBooking = (roomId: RoomId) => useScheduleMutation(roomId, api.refetchBooking);
export const useUnlinkBooking = (roomId: RoomId) => useScheduleMutation(roomId, api.unlinkBooking);
export const useSaveScheduleItem = (roomId: RoomId) => useScheduleMutation(roomId, api.saveScheduleItem);
export const useDeleteScheduleItem = (roomId: RoomId) => useScheduleMutation(roomId, api.deleteScheduleItem);
export const useSetScheduleHidden = (roomId: RoomId) => useScheduleMutation(roomId, api.setScheduleHidden);
export const useSetExpenseMeta = (roomId: RoomId) => useScheduleMutation(roomId, api.setExpenseMeta);
