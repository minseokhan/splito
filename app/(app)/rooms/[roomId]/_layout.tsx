import { Stack } from 'expo-router';

// Realtime 구독은 5-ledger phase가 추가한다.
export default function RoomLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
