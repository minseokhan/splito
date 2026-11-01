import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from 'react-native';

import { ToastProvider } from '@/components/Toast';
import { AuthProvider } from '@/hooks/useAuth';
import { queryClient } from '@/services/queryClient';
import { MAX_FONT_SIZE_MULTIPLIER } from '@/theme/tokens';

// 시스템 글꼴 크기는 따르되 최대 1.3배.
type WithDefaultProps = { defaultProps?: { maxFontSizeMultiplier?: number } };
for (const C of [Text, TextInput] as unknown as WithDefaultProps[]) {
  C.defaultProps = { ...C.defaultProps, maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER };
}

export default function RootLayout() {
  const [loaded] = useFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
  });
  if (!loaded) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
