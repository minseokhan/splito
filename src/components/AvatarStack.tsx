import { Text, View } from 'react-native';

import { Avatar } from './Avatar';

export type AvatarPerson = { id: string; name: string; colorIndex: number; guest: boolean };

const MAX = 4;

// 겹친 원형 아바타(24px, −8px 겹침, 최대 4개 + "+n").
export function AvatarStack({ people }: { people: AvatarPerson[] }) {
  const rest = people.length - MAX;
  return (
    <View className="flex-row items-center">
      {people.slice(0, MAX).map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={p.name} colorIndex={p.colorIndex} guest={p.guest} />
        </View>
      ))}
      {rest > 0 && <Text className="ml-1 text-[13px] text-ink-500">+{rest}</Text>}
    </View>
  );
}
