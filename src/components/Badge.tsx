import { Pressable, Text } from 'react-native';

const STYLE = {
  review: { label: '확인필요', cls: 'bg-warning-badge', fg: 'text-warning' },
  pending: { label: '환율 대기', cls: 'bg-warning-badge', fg: 'text-warning' },
  private: { label: '나만 보기', cls: 'bg-muted', fg: 'text-ink-500' },
} as const;

type Props = { kind: keyof typeof STYLE; onPress?: () => void; accessibilityLabel?: string };

// 배지 12/600, radius 6, padding 2×6. onPress가 있으면 탭으로 해제할 수 있다.
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
      <Text className={`font-semibold text-xs ${s.fg}`}>{s.label}</Text>
    </Pressable>
  );
}
