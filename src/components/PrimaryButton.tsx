import type { ComponentType } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop, type SvgProps } from 'react-native-svg';

import { colors } from '@/theme/tokens';

import { Icon } from './Icon';

// 하늘색 위 글자는 흰색이 아니라 on-primary(#0B2B45). 비활성은 투명도 대신 회색 배경.
const VARIANT = {
  primary: { box: 'bg-primary active:bg-primary-press', text: 'text-primary-on', icon: colors.primary.on },
  dark: { box: 'bg-ink active:bg-black', text: 'text-white', icon: '#FFFFFF' },
  muted: { box: 'bg-muted active:bg-line', text: 'text-ink', icon: colors.ink.DEFAULT },
  sky: { box: 'bg-sky-100 active:bg-sky-200', text: 'text-primary-text', icon: colors.primary.text },
  kakao: { box: 'bg-kakao active:bg-[#F2DA00]', text: 'text-kakao-text', icon: colors.kakao.text },
  naver: { box: 'bg-naver active:bg-[#02B350]', text: 'text-white', icon: '#FFFFFF' },
  danger: { box: 'bg-white border-[1.5px] border-line active:bg-muted', text: 'text-danger-text', icon: colors.danger.text },
} as const;

export type ButtonVariant = keyof typeof VARIANT;

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  icon?: ComponentType<SvgProps>;
  size?: 'lg' | 'md'; // lg 56 / 17, md 52 / 16
  accessibilityLabel?: string;
  /** 가로 배치에서 남은 폭을 채운다. */
  grow?: boolean;
};

export function PrimaryButton({ title, onPress, disabled, loading, variant = 'primary', icon, size = 'lg', accessibilityLabel, grow }: Props) {
  const v = VARIANT[variant];
  const off = disabled || loading;
  const h = size === 'lg' ? 'h-14 rounded-button' : 'h-[52px] rounded-input';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      className={`${h} ${grow ? 'flex-1' : ''} flex-row items-center justify-center gap-2 px-4 active:translate-y-px ${disabled ? 'bg-line' : v.box}`}
    >
      {loading ? (
        <ActivityIndicator color={v.icon} />
      ) : (
        <>
          {icon && <Icon as={icon} size={22} color={disabled ? colors.ink[300] : v.icon} />}
          <Text className={`font-semibold ${size === 'lg' ? 'text-[17px]' : 'text-base'} ${disabled ? 'text-ink-300' : v.text}`}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type BarProps = {
  children: React.ReactNode;
  /** 바 배경색(화면 배경과 같게). fade면 위로 24pt 투명 그라데이션을 깐다. */
  bg?: string;
  fade?: boolean;
  shadow?: boolean;
  row?: boolean;
};

// 하단 고정 CTA 영역: 패딩 12 20 + 하단 안전 영역. 스크롤 콘텐츠는 하단 130~140 여백을 둔다.
export function BottomBar({ children, bg = '#FFFFFF', fade, shadow, row }: BarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`absolute bottom-0 left-0 right-0 gap-2.5 px-5 pt-3 ${row ? 'flex-row' : ''}`}
      style={[
        { backgroundColor: bg, paddingBottom: Math.max(insets.bottom + 12, 24) },
        shadow && { boxShadow: '0 -8px 20px -12px rgba(19,25,39,.15)' },
      ]}
    >
      {fade && (
        <Svg pointerEvents="none" width="100%" height={28} style={{ position: 'absolute', top: -28, left: 0, right: 0 }}>
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={bg} stopOpacity={0} />
              <Stop offset="1" stopColor={bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#fade)" />
        </Svg>
      )}
      {children}
    </View>
  );
}
