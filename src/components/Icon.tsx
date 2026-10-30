import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// Iconoir(outline 1.5). 라이브러리 기본 크기가 '1.5em'이라 RN에서는 항상 숫자로 넘긴다.
type Props = { as: ComponentType<SvgProps>; size?: number; color?: string; accessibilityLabel?: string };

export function Icon({ as: C, size = 24, color = colors.ink.DEFAULT, accessibilityLabel }: Props) {
  return (
    <C
      width={size}
      height={size}
      color={color}
      strokeWidth={1.5}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
