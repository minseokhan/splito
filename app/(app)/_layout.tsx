import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';

// 합류 시트로 바로 들어와도 아래에 내 여행 목록이 깔리게 한다.
export const unstable_settings = { initialRouteName: 'home' };

export default function AppLayout() {
  const { session } = useAuth();
  if (session === undefined) return null; // 저장된 세션 복원 중
  if (!session) return <Redirect href="/(auth)/login" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="join/[token]" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
      {/* 홈 ↔ 통계는 탭 전환이라 옆으로 미는 전환을 쓰지 않는다(들어올 때·나갈 때 모두 stats의 설정을 따른다). */}
      <Stack.Screen name="stats" options={{ animation: 'none' }} />
    </Stack>
  );
}
