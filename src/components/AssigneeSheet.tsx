import { Check } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { Avatar } from './Avatar';
import type { AvatarPerson } from './AvatarStack';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  visible: boolean;
  people: AvatarPerson[]; // 대상 인원만
  selected: string[]; // 비면 전원
  summary: string; // "2명 · 1인 ¥1,640"
  onToggle: (id: string) => void;
  onClose: () => void;
};

export function AssigneeSheet({ visible, people, selected, summary, onToggle, onClose }: Props) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="누가 나눌까요?"
      subtitle={selected.length ? summary : `아무도 고르지 않으면 전원 · ${summary}`}
    >
      <View>
        {people.map((p) => {
          const on = selected.includes(p.id);
          const label = p.guest ? `${p.name}(게스트)` : p.name;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={label}
              onPress={() => onToggle(p.id)}
              className="min-h-14 flex-row items-center gap-3"
            >
              <Avatar name={p.name} colorIndex={p.colorIndex} guest={p.guest} size={36} />
              <Text className="flex-1 font-semibold text-base text-ink">{label}</Text>
              <View className={`h-6 w-6 items-center justify-center rounded-full ${on ? 'bg-primary' : 'border-[1.5px] border-line-off'}`}>
                {on && <Icon as={Check} size={16} color={colors.primary.on} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <PrimaryButton title="완료" onPress={onClose} />
    </BottomSheet>
  );
}
