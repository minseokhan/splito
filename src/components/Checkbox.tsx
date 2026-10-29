import { Check } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

type Props = { label: string; checked: boolean; onChange: (checked: boolean) => void; bold?: boolean };

export function Checkbox({ label, checked, onChange, bold }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      className="min-h-11 flex-1 flex-row items-center gap-3"
    >
      <View
        className={`h-6 w-6 items-center justify-center rounded-md border ${checked ? 'border-sky-800 bg-sky-800' : 'border-input-line bg-white'}`}
      >
        {checked && <Check size={16} strokeWidth={1.75} color={colors.ink[900]} />}
      </View>
      <Text className={`flex-1 text-[15px] ${bold ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{label}</Text>
    </Pressable>
  );
}
