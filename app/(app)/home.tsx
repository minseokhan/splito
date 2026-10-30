import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InvitePasteBox } from '@/components/InvitePasteBox';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoomCard } from '@/components/RoomCard';
import { useMyRooms } from '@/hooks/useRooms';

const TABS = [
  { key: 'active', label: '진행 중' },
  { key: 'settled', label: '정산 완료' },
] as const;

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('active');
  const { data: rooms, isLoading, error, refetch, isRefetching } = useMyRooms();
  const list = (rooms ?? []).filter((r) => (r.status === 'settled') === (tab === 'settled'));
  const create = () => router.push('/rooms/new');

  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-row items-center justify-between pb-4 pt-6">
        <Text className="font-bold text-[22px] text-ink-900">내 여행</Text>
        {/* 내 정보 화면(F9.2)은 P1. 지금은 받을 계좌 진입만 둔다. */}
        <Pressable accessibilityRole="button" onPress={() => router.push('/payout-account')} className="h-11 justify-center px-2">
          <Text className="font-medium text-[15px] text-sky-900">받을 계좌</Text>
        </Pressable>
      </View>
      {rooms && rooms.length > 0 && (
        <View className="mb-4 flex-row gap-2">
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
              onPress={() => setTab(t.key)}
              className={`h-11 justify-center rounded-md px-4 ${tab === t.key ? 'bg-sky-300' : 'bg-sky-100'}`}
            >
              <Text className="font-semibold text-[15px] text-ink-900">{t.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {isLoading ? null : error ? (
        <Text className="text-[15px] text-minus">{error.message}</Text>
      ) : rooms?.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="font-semibold text-[17px] text-ink-900">첫 여행을 만들어 볼까요?</Text>
          {/* 로그인 상태: 저장 후 '/'로 보내면 resolveEntryRoute가 합류 확인으로 보낸다. */}
          <View className="w-full pt-8">
            <InvitePasteBox onSaved={() => router.replace('/')} />
          </View>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(r) => r.roomId}
          contentContainerClassName="gap-2 pb-4"
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <RoomCard
              room={item}
              onPress={() => router.push({ pathname: '/rooms/[roomId]', params: { roomId: item.roomId } })}
            />
          )}
          ListEmptyComponent={
            <Text className="pt-8 text-center text-[15px] text-ink-500">
              {tab === 'settled' ? '정산이 끝난 여행이 없어요' : '진행 중인 여행이 없어요'}
            </Text>
          }
        />
      )}
      <View className="pb-4 pt-2">
        <PrimaryButton title="+ 여행 만들기" onPress={create} />
      </View>
    </SafeAreaView>
  );
}
