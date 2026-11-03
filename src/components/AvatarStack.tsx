import { Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { Avatar } from './Avatar';

export type AvatarPerson = { id: string; name: string; colorIndex: number; guest: boolean };

// 원은 4개를 넘지 않는다: 4명까지는 전부, 5명부터는 3명 + "+n" 검은 원.
const MAX = 4;

// 겹친 원형 아바타(-8 겹침). ring은 배경색과 같은 테두리.
export function AvatarStack({ people, size = 24, ring }: { people: AvatarPerson[]; size?: number; ring?: string }) {
  const rest = people.length > MAX ? people.length - (MAX - 1) : 0;
  const shown = people.slice(0, rest > 0 ? MAX - 1 : MAX);
  return (
    <View className="flex-row items-center">
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={p.name} colorIndex={p.colorIndex} guest={p.guest} size={size} ring={ring} />
        </View>
      ))}
      {rest > 0 && (
        <View
          accessibilityLabel={`외 ${rest}명`}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            marginLeft: -8,
            backgroundColor: colors.ink.DEFAULT,
            borderWidth: ring ? 2.5 : 0,
            borderColor: ring,
          }}
          className="items-center justify-center"
        >
          <Text style={{ fontSize: Math.round(size * 0.37) }} className="font-semibold text-white">
            +{rest}
          </Text>
        </View>
      )}
    </View>
  );
}
