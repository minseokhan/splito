import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/theme/tokens';

type Props = TextInputProps & { invalid?: boolean; right?: ReactNode };

// 입력 54h, radius 14, border 1.5. 포커스: primary 테두리 + 4px 하늘색 링, 오류: danger 테두리.
export function TextField({ invalid, right, onFocus, onBlur, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  const border = invalid ? colors.danger.DEFAULT : focused ? colors.primary.DEFAULT : colors.line.DEFAULT;
  return (
    <View
      className="h-[54px] flex-row items-center gap-2 rounded-input bg-white px-4"
      style={{ borderWidth: 1.5, borderColor: border, boxShadow: focused && !invalid ? '0 0 0 4px rgba(54,182,255,.18)' : undefined }}
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
        className="h-full flex-1 font-semibold text-[17px] text-ink"
      />
      {right}
    </View>
  );
}
