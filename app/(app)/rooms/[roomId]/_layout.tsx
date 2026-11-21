import { Stack, useLocalSearchParams } from 'expo-router';

import { useRealtimeRoom } from '@/hooks/useRealtimeRoom';

// 홈·통계에서 지출 추가로 바로 들어와도 아래에 여행 상세를 깐다 — 방법 선택 시트가 상세 위에 뜨는 시안대로. 닫으면 상세로 간다.
export const unstable_settings = { initialRouteName: 'index' };

export default function RoomLayout() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  useRealtimeRoom(roomId);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 방법 선택이 여행 상세 위 바텀시트라 투명 모달로 띄운다(11-18 시안 §3). 카메라·문자 단계는 화면이 스스로 흰 바탕을 깐다. */}
      <Stack.Screen name="expenses/new" options={{ presentation: 'transparentModal', animation: 'fade' }} />
    </Stack>
  );
}
