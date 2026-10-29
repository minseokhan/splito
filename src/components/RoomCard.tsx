import { Pressable, Text, View } from 'react-native';

import type { MyRoom } from '@/types/domain';

import { Money } from './Money';
import { StatusChip } from './StatusChip';

// 'YYYY-MM-DD' → 'M/D'
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function RoomCard({ room, onPress }: { room: MyRoom; onPress: () => void }) {
  const period = room.startDate ? `${md(room.startDate)} ~ ${room.endDate ? md(room.endDate) : ''}` : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center justify-between rounded-xl border border-line bg-white p-4"
    >
      <View className="flex-1 gap-1 pr-3">
        <Text className="font-semibold text-base text-ink-900" numberOfLines={1}>
          {room.name}
        </Text>
        {period && <Text className="text-[13px] text-ink-500">{period}</Text>}
        <StatusChip status={room.status} />
      </View>
      <Money net={room.myNet} />
    </Pressable>
  );
}
