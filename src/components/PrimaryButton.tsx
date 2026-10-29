import { Pressable, Text } from 'react-native';

type Props = { title: string; onPress: () => void; disabled?: boolean };

// UI_GUIDE Primary: 하늘색 배경 위 글자는 흰색이 아니라 ink-900.
export function PrimaryButton({ title, onPress, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-14 items-center justify-center rounded-xl bg-sky-800 active:bg-[#1FA3F0] ${disabled ? 'opacity-40' : ''}`}
    >
      <Text className="font-bold text-base text-ink-900">{title}</Text>
    </Pressable>
  );
}
