import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/theme/tokens';

type Props = TextInputProps & { invalid?: boolean; right?: ReactNode };

// 입력 54h, radius 12, border 1. 포커스: primary-text 테두리 + 4px rgba(18,114,191,.16) 링, 오류: danger 테두리.
export function TextField({ invalid, right, onFocus, onBlur, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  const border = invalid ? colors.danger.DEFAULT : focused ? colors.primary.text : colors.line.DEFAULT;
  return (
    <View
      className="h-[54px] flex-row items-center gap-2 rounded-input bg-white px-4"
      style={{ borderWidth: 1, borderColor: border, boxShadow: focused && !invalid ? '0 0 0 4px rgba(18,114,191,.16)' : undefined }}
    >
      <TextInput
        placeholderTextColor={colors.ink[300]}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className="h-full flex-1 font-semibold text-17 text-ink"
      />
      {right}
    </View>
  );
}
