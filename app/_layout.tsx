import '../global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { Text, TextInput } from 'react-native';

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
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
  });
  if (!loaded) return null;
  return <Stack />;
}
