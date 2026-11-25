import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { colors } from '@/theme/tokens';

// 노션 36번: 플레이스홀더는 400 · #8A92A3, 입력한 글자는 각 칸의 기존 굵기(대부분 600).
// RN은 플레이스홀더 굵기를 따로 못 줘서, 값이 비어 있는 동안만 글꼴을 Regular로 바꾼다.
export const Input = forwardRef<TextInput, TextInputProps>(function Input({ style, ...props }, ref) {
  const empty = !props.value && !props.defaultValue;
  return (
    <TextInput
      ref={ref}
      {...props}
      placeholderTextColor={colors.ink[300]}
      style={[style, empty && { fontFamily: 'Pretendard-Regular' }]}
    />
  );
});
