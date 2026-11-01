import { Text, View } from 'react-native';

import { memberColor } from '@/theme/tokens';

// 멤버 아바타: 원형, 이름 첫 글자, 합류 순서별 tint/fg. 게스트는 점선 테두리.
type Props = { name: string; colorIndex: number; guest?: boolean; size?: number; ring?: string };

export function Avatar({ name, colorIndex, guest, size = 36, ring }: Props) {
  const c = memberColor(colorIndex);
  return (
    <View
      accessibilityLabel={guest ? `${name}(게스트)` : name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.tint,
        borderWidth: ring ? 2.5 : guest ? 1.5 : 0,
        borderStyle: guest && !ring ? 'dashed' : 'solid',
        borderColor: ring ?? c.fg,
      }}
      className="items-center justify-center"
    >
      <Text style={{ fontSize: Math.round(size * 0.37), color: c.fg }} className="font-semibold">
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}

// 게스트 이름 옆 칩.
export function GuestChip() {
  return (
    <View className="rounded-badge bg-muted px-1.5 py-0.5">
      <Text className="font-semibold text-xs text-ink-500">게스트</Text>
    </View>
  );
}
