import { Pressable, Text } from 'react-native';

const STYLE = {
  review: { label: '확인필요', cls: 'bg-warning-bg', fg: 'text-warning' },
  pending: { label: '환율 대기', cls: 'bg-muted', fg: 'text-ink-500' },
} as const;

type Props = { kind: keyof typeof STYLE; onPress?: () => void; accessibilityLabel?: string };

// 배지 11/700, radius 6, padding 2×6. onPress가 있으면 탭으로 해제할 수 있다.
export function Badge({ kind, onPress, accessibilityLabel }: Props) {
  const s = STYLE[kind];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? s.label}
      hitSlop={10}
      className={`self-center rounded-[6px] px-1.5 py-0.5 ${s.cls}`}
    >
      <Text className={`font-bold text-[11px] ${s.fg}`}>{s.label}</Text>
    </Pressable>
  );
}
