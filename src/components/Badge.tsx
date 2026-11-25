import { Pressable, Text } from 'react-native';

const STYLE = {
  review: { label: '확인 필요', cls: 'bg-warning-badge', fg: 'text-warning-text' },
  pending: { label: '환율 대기', cls: 'bg-warning-badge', fg: 'text-warning-text' },
  private: { label: '나만 보기', cls: 'bg-muted', fg: 'text-ink-500' },
} as const;

type Props = { kind: keyof typeof STYLE; onPress?: () => void; accessibilityLabel?: string };

// 배지 11/600, radius 8, padding 1×6(원본 '확인 필요'). onPress가 있으면 탭으로 해제할 수 있다.
export function Badge({ kind, onPress, accessibilityLabel }: Props) {
  const s = STYLE[kind];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? s.label}
      hitSlop={10}
      className={`self-center rounded-badge px-1.5 py-px ${s.cls}`}
    >
      <Text className={`font-semibold text-11 ${s.fg}`}>{s.label}</Text>
    </Pressable>
  );
}
