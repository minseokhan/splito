import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';

export default function AppLayout() {
  const { session } = useAuth();
  if (session === undefined) return null; // 저장된 세션 복원 중
  if (!session) return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
