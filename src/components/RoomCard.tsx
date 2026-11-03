import { Suitcase } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';

import { currencyFlag } from '@/lib/flag';
import type { MyRoom } from '@/types/domain';

import { FlightIcon } from './FlightIcon';
import { Icon } from './Icon';
import { formatKrw, netSign } from './Money';
import { StatusChip } from './StatusChip';

// 'YYYY-MM-DD' → 'M.D'
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

export function roomPeriod(room: Pick<MyRoom, 'startDate' | 'endDate'>) {
  if (!room.startDate) return null;
  return room.endDate ? `${md(room.startDate)} – ${md(room.endDate)}` : `${md(room.startDate)} –`;
}

type Props = { room: MyRoom; featured?: boolean; onPress: () => void; onPressAmount: () => void };

// 홈 캐러셀 카드 260w(시안 03). 대표 카드는 네이비 틴트(sky-300), 나머지는 민트(success-bg).
export function RoomCard({ room, featured, onPress, onPressAmount }: Props) {
  const period = roomPeriod(room);
  const flag = currencyFlag(room.baseCurrency);
  const net = room.myNet;
  const label = net < 0 ? '내가 보낼 돈' : net > 0 ? '내가 받을 돈' : '정산할 돈';
  const amountCls = net < 0 ? 'text-danger' : net > 0 ? 'text-primary-text' : 'text-ink-alt';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={room.name}
      onPress={onPress}
      className={`w-[260px] gap-14 overflow-hidden rounded-hero p-5 ${featured ? 'bg-sky-300' : 'bg-success-bg'}`}
    >
      <View className="gap-1.5">
        <View className="flex-row items-center justify-between gap-1.5">
          <StatusChip status={room.status} suffix={room.baseCurrency} />
          {room.hasBooking && (
            <View className="flex-row items-center gap-1 rounded-full bg-ink py-1 pl-[7px] pr-[9px]">
              {/* 캐리어 아이콘 금색은 이 배지 한 곳뿐이라 토큰을 만들지 않는다(시안 03 #FFC94D). */}
              <Icon as={Suitcase} size={15} color="#FFC94D" />
              <Text className="font-semibold text-xs text-white">패키지</Text>
            </View>
          )}
        </View>
        <View className="mt-2 flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-input border-[1.5px] border-white/90 bg-white/50">
            {/* 통화로 국가를 특정 못 하거나 기기가 국기 이모지를 못 그리면 비행기로 돌아간다. */}
            {flag ? <Text className="text-2xl">{flag}</Text> : <FlightIcon size={22} />}
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-xl text-ink-alt" numberOfLines={1}>
              {room.name}
            </Text>
            <Text className="text-sm text-ink-alt">
              {period ? `${period} · ` : ''}
              {room.memberCount}명
            </Text>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${formatKrw(Math.abs(net))}`}
        onPress={onPressAmount}
        className="flex-row items-center justify-between rounded-[18px] bg-white p-3.5"
      >
        <Text className="text-[13px] text-ink-500">{label}</Text>
        <Text style={{ fontVariant: ['tabular-nums'] }} className={`font-semibold text-[18px] ${amountCls}`}>
          {net > 0 ? netSign(net) : ''}
          {formatKrw(Math.abs(net))}
        </Text>
      </Pressable>
    </Pressable>
  );
}
