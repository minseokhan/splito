import { Text, View } from 'react-native';

import { Avatar } from './Avatar';

export type AvatarPerson = { id: string; name: string; colorIndex: number; guest: boolean };

const MAX = 4;

// 겹친 원형 아바타(-8 겹침, 최대 4개 + "+n"). ring은 배경색과 같은 테두리.
export function AvatarStack({ people, size = 24, ring }: { people: AvatarPerson[]; size?: number; ring?: string }) {
  const rest = people.length - MAX;
  return (
    <View className="flex-row items-center">
      {people.slice(0, MAX).map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={p.name} colorIndex={p.colorIndex} guest={p.guest} size={size} ring={ring} />
        </View>
      ))}
      {rest > 0 && <Text className="ml-1 text-[13px] text-ink-400">+{rest}</Text>}
    </View>
  );
}
