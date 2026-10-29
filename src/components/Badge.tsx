import { Pressable, Text } from 'react-native';

const STYLE = {
  review: { label: '확인 필요', cls: 'bg-review-bg', fg: 'text-review-fg' },
  pending: { label: '환율 대기', cls: 'bg-pending-bg', fg: 'text-pending-fg' },
} as const;

type Props = { kind: keyof typeof STYLE; onPress?: () => void; accessibilityLabel?: string };

// 배지 12 SemiBold. onPress가 있으면 탭으로 해제할 수 있다.
export function Badge({ kind, onPress, accessibilityLabel }: Props) {
  const s = STYLE[kind];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? s.label}
      hitSlop={10}
      className={`self-start rounded-md px-2 py-1 ${s.cls}`}
    >
      <Text className={`font-semibold text-xs ${s.fg}`}>{s.label}</Text>
    </Pressable>
  );
}
