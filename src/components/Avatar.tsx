import { Text, View } from 'react-native';

import { colors, memberColor } from '@/theme/tokens';

// 멤버 아바타: 원형, 이름 첫 글자. 멤버는 진한 fg 바탕 + 흰 글자(시안),
// 게스트는 연한 tint 바탕 + 점선 테두리로 구분한다.
type Props = { name: string; colorIndex: number; guest?: boolean; size?: number; ring?: string };

export function Avatar({ name, colorIndex, guest, size = 36, ring }: Props) {
  const m = memberColor(colorIndex);
  const c = guest ? m : { tint: m.fg, fg: colors.primary.on };
  return (
    <View
      accessibilityLabel={guest ? `${name}(게스트)` : name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.tint,
        borderWidth: ring ? 2 : guest ? 1.5 : 0,
        borderStyle: guest && !ring ? 'dashed' : 'solid',
        borderColor: ring ?? m.fg,
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
