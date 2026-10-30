import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { InputMethodSheet } from '@/components/InputMethodSheet';
import { formatKrw, Money } from '@/components/Money';
import { StatusChip } from '@/components/StatusChip';
import { useMyRooms } from '@/hooks/useRooms';
import { loadDraft } from '@/services/drafts';
import { colors } from '@/theme/tokens';

export default function RoomHome() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  // 순잔액·총지출은 서버 my_rooms 값만 쓴다.
  const { data: rooms, isLoading } = useMyRooms();
  const room = rooms?.find((r) => r.roomId === roomId);
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  // 입력 화면에서 돌아올 때마다 기기의 작성 중 지출을 다시 확인한다.
  useFocusEffect(
    useCallback(() => {
      void loadDraft(roomId).then((d) => setHasDraft(!!d));
    }, [roomId]),
  );
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
        {hasDraft && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/rooms/[roomId]/expenses/review', params: { roomId } })}
            className="mt-2 h-11 justify-center rounded-lg border border-line px-4"
          >
            <Text className="font-medium text-[15px] text-sky-900">작성 중인 지출 1건 · 이어서 쓰기</Text>
          </Pressable>
        )}
      </View>
      {/* 피드는 5-ledger phase가 추가한다. */}
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-[15px] text-ink-700">
          첫 지출을 올려보세요. 영수증 사진 한 장이면 돼요.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="지출 추가"
        onPress={() => setSheetOpen(true)}
        style={{ bottom: insets.bottom + 16 }}
        className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-sky-800 active:bg-[#1FA3F0]"
      >
        <Plus size={24} strokeWidth={1.75} color={colors.ink[900]} />
      </Pressable>
      <InputMethodSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={(method) => {
          setSheetOpen(false);
          router.push({ pathname: '/rooms/[roomId]/expenses/new', params: { roomId, method } });
        }}
      />
    </SafeAreaView>
  );
}
