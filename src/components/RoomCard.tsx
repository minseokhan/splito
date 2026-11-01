import { Pressable, Text, View } from 'react-native';

import type { MyRoom } from '@/types/domain';

import { SplitoSymbol } from './Logo';
import { formatKrw, netSign } from './Money';
import { StatusChip } from './StatusChip';

// 'YYYY-MM-DD' → 'M.D'
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

export function roomPeriod(room: Pick<MyRoom, 'startDate' | 'endDate'>) {
  if (!room.startDate) return null;
  return room.endDate ? `${md(room.startDate)} – ${md(room.endDate)}` : `${md(room.startDate)} –`;
}

type Props = { room: MyRoom; featured?: boolean; onPress: () => void; onPressAmount: () => void };

// 홈 캐러셀 카드 286w. 대표 카드는 하늘색 + 흰 심볼 장식, 나머지는 민트(success-bg).
export function RoomCard({ room, featured, onPress, onPressAmount }: Props) {
  const period = roomPeriod(room);
  const net = room.myNet;
  const label = net < 0 ? '내가 보낼 돈' : net > 0 ? '내가 받을 돈' : '정산할 돈';
  const amountCls = net < 0 ? 'text-danger' : net > 0 ? 'text-primary-text' : 'text-ink';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={room.name}
      onPress={onPress}
      className={`w-[286px] gap-14 overflow-hidden rounded-hero p-[22px] ${featured ? 'bg-primary' : 'bg-success-bg'}`}
    >
      {featured && (
        <View pointerEvents="none" style={{ position: 'absolute', right: -24, top: -20 }}>
          {/* 시안은 컬러 심볼을 저투명도로 깐다(0.35 × 0.5). 흰 실루엣은 형체가 뭉개진다. */}
          <SplitoSymbol size={150} opacity={0.175} />
        </View>
      )}
      <View className="gap-1.5">
        <StatusChip status={room.status} suffix={room.baseCurrency} />
        <Text className="mt-2 font-semibold text-[22px] text-primary-on" numberOfLines={1}>
          {room.name}
        </Text>
        <Text className="text-[15px] text-primary-on">
          {period ? `${period} · ` : ''}
          {room.memberCount}명
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${formatKrw(Math.abs(net))}`}
        onPress={onPressAmount}
        className="flex-row items-center justify-between rounded-[18px] bg-white p-4"
      >
        <Text className="text-sm text-ink-500">{label}</Text>
        <Text style={{ fontVariant: ['tabular-nums'] }} className={`font-semibold text-xl ${amountCls}`}>
          {net > 0 ? netSign(net) : ''}
          {formatKrw(Math.abs(net))}
        </Text>
      </Pressable>
    </Pressable>
  );
}
