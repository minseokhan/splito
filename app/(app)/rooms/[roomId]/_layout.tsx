import { Stack, useLocalSearchParams } from 'expo-router';

import { useRealtimeRoom } from '@/hooks/useRealtimeRoom';

export default function RoomLayout() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  useRealtimeRoom(roomId);
  return <Stack screenOptions={{ headerShown: false }} />;
}
