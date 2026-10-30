import { Camera, MessageSquare, Mic, PenLine, type LucideIcon } from 'lucide-react-native';
import { Pressable, Text } from 'react-native';

import { colors } from '@/theme/tokens';

import { BottomSheet } from './BottomSheet';

export type InputMethod = 'photo' | 'text' | 'voice' | 'manual';

const METHODS: { method: InputMethod; label: string; a11y: string; Icon: LucideIcon }[] = [
  { method: 'photo', label: '사진', a11y: '영수증 사진으로 지출 추가', Icon: Camera },
  { method: 'text', label: '문자 붙여넣기', a11y: '카드 문자 붙여넣기로 지출 추가', Icon: MessageSquare },
  { method: 'voice', label: '음성', a11y: '음성으로 지출 추가', Icon: Mic },
  { method: 'manual', label: '직접 입력', a11y: '직접 입력으로 지출 추가', Icon: PenLine },
];

type Props = { visible: boolean; onClose: () => void; onSelect: (method: InputMethod) => void };

export function InputMethodSheet({ visible, onClose, onSelect }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="mb-2 font-semibold text-[17px] text-ink-900">지출 추가</Text>
      {METHODS.map(({ method, label, a11y, Icon }) => (
        <Pressable
          key={method}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          onPress={() => onSelect(method)}
          className="h-14 flex-row items-center gap-3 active:bg-sky-100"
        >
          <Icon size={24} strokeWidth={1.75} color={colors.ink[900]} />
          <Text className="text-[15px] text-ink-900">{label}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}
