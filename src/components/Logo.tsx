import { Text } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// assets/logo/splito-symbol*.svg와 같은 도형(viewBox 0 0 120 120). 파일을 직접 쓰지 않고 그려서 색·볼터치만 바꾼다.
const BODY = 'M70.1 49.9L77 27.6A42 42 0 1 0 92.4 43Z';

type Variant = 'color' | 'white' | 'navy' | 'silhouette';

const PALETTE: Record<Variant, { body: string; face?: string }> = {
  color: { body: colors.primary.DEFAULT, face: colors.ink.DEFAULT }, // splito-symbol.svg
  white: { body: '#FFFFFF', face: colors.primary.DEFAULT }, // splito-symbol-white.svg
  navy: { body: colors.ink.DEFAULT, face: '#FFFFFF' }, // splito-symbol-mono-navy.svg
  silhouette: { body: '#FFFFFF' }, // 홈 대표 카드 장식(얼굴 없음)
};

type Props = { size: number; variant?: Variant; blush?: boolean; opacity?: number };

export function SplitoSymbol({ size, variant = 'color', blush = false, opacity }: Props) {
  const p = PALETTE[variant];
  const outline = variant !== 'silhouette';
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" opacity={opacity}>
      <Path
        d={BODY}
        fill={p.body}
        stroke={outline ? p.body : undefined}
        strokeWidth={outline ? 4 : undefined}
        strokeLinejoin="round"
      />
      {p.face && (
        <>
          <Circle cx={42} cy={66} r={5} fill={p.face} />
          <Circle cx={70} cy={66} r={5} fill={p.face} />
          <Path d="M48 80Q56 88 64 80" stroke={p.face} strokeWidth={4.5} strokeLinecap="round" fill="none" />
        </>
      )}
      {blush && (
        <>
          <Ellipse cx={31} cy={78} rx={5.5} ry={3.2} fill="#fff" opacity={0.55} />
          <Ellipse cx={81} cy={78} rx={5.5} ry={3.2} fill="#fff" opacity={0.55} />
        </>
      )}
    </Svg>
  );
}

// splito-wordmark.svg: Fredoka 700, #36B6FF.
export function Wordmark({ size }: { size: number }) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="스플리토"
      style={{ fontSize: size, lineHeight: size * 1.15, includeFontPadding: false }}
      className="font-wordmark text-primary"
    >
      splito
    </Text>
  );
}
