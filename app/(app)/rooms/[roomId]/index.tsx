import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatKrw, Money } from '@/components/Money';
import { StatusChip } from '@/components/StatusChip';
import { useMyRooms } from '@/hooks/useRooms';

export default function RoomHome() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  // 순잔액·총지출은 서버 my_rooms 값만 쓴다.
  const { data: rooms, isLoading } = useMyRooms();
  const room = rooms?.find((r) => r.roomId === roomId);
  if (isLoading) return null;
  if (!room) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-5">
        <Text className="text-[15px] text-ink-700">여행을 찾을 수 없어요</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="gap-2 px-5 pt-6">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 font-bold text-[22px] text-ink-900" numberOfLines={1}>
            {room.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="동행 초대하기"
            onPress={() => router.push({ pathname: '/rooms/[roomId]/invite', params: { roomId } })}
            className="h-11 justify-center px-2"
          >
            <Text className="font-medium text-[15px] text-sky-900">초대</Text>
          </Pressable>
        </View>
        <StatusChip status={room.status} />
        <View className="mt-4 flex-row items-end justify-between rounded-xl bg-sky-200 p-4">
          <View>
            <Text className="text-[13px] text-ink-500">총지출</Text>
            <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-[17px] text-ink-900">
              {formatKrw(room.totalKrw)}
            </Text>
          </View>
          <Money net={room.myNet} size="large" />
        </View>
        {room.memberCount === 1 && (
          <Text className="text-[13px] text-ink-500">모든 동행이 앱에 가입해야 정확히 나눠져요</Text>
        )}
      </View>
      {/* 피드는 5-ledger, FAB는 4-expense-input phase가 추가한다. */}
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-[15px] text-ink-700">
          첫 지출을 올려보세요. 영수증 사진 한 장이면 돼요.
        </Text>
      </View>
    </SafeAreaView>
  );
}
