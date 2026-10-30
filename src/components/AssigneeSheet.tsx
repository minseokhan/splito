import { Pressable, Text, View } from 'react-native';

import { Avatar } from './Avatar';
import type { AvatarPerson } from './AvatarStack';
import { BottomSheet } from './BottomSheet';
import { Checkbox } from './Checkbox';

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
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="font-semibold text-[17px] text-ink-900">누가 나눌까요?</Text>
      <Text className="mt-1 text-[13px] text-ink-500">{selected.length ? summary : `아무도 고르지 않으면 전원 · ${summary}`}</Text>
      <View className="mt-4">
        {people.map((p) => (
          <View key={p.id} className="flex-row items-center gap-3">
            <Avatar name={p.name} colorIndex={p.colorIndex} guest={p.guest} size={32} />
            <Checkbox label={p.guest ? `${p.name}(게스트)` : p.name} checked={selected.includes(p.id)} onChange={() => onToggle(p.id)} />
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={onClose} className="mt-4 h-14 items-center justify-center rounded-xl bg-sky-200">
        <Text className="font-semibold text-base text-ink-900">완료</Text>
      </Pressable>
    </BottomSheet>
  );
}
