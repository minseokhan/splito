import { Text, View } from 'react-native';

// UI_GUIDE 아바타: 합류 순서로 색을 순환한다. 게스트는 점선 테두리.
const BG = ['#80D1FF', '#FFD27A', '#A8E6C9', '#FFB3B3', '#C9D7FF'];

type Props = { name: string; colorIndex: number; guest?: boolean; size?: number };

export function Avatar({ name, colorIndex, guest, size = 24 }: Props) {
  return (
    <View
      accessibilityLabel={guest ? `${name}(게스트)` : name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: BG[colorIndex % BG.length],
        borderWidth: guest ? 1.5 : 1,
        borderStyle: guest ? 'dashed' : 'solid',
        borderColor: guest ? '#5E7185' : '#FFFFFF',
      }}
      className="items-center justify-center"
    >
      <Text style={{ fontSize: size * 0.45 }} className="font-semibold text-ink-900">
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}

// 게스트 이름 옆 칩(UI_GUIDE: 12 SemiBold, #EEF2F5 / #33475B).
export function GuestChip() {
  return (
    <View className="rounded-md bg-pending-bg px-1.5 py-0.5">
      <Text className="font-semibold text-xs text-pending-fg">게스트</Text>
    </View>
  );
}
