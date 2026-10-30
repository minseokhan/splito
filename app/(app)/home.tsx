import { router } from 'expo-router';
import { Bank, Camera, EditPencil, MessageText, Microphone, NavArrowDown, NavArrowRight, Plus, User } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { InvitePasteBox } from '@/components/InvitePasteBox';
import { SplitoSymbol, Wordmark } from '@/components/Logo';
import { formatKrw } from '@/components/Money';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { RoomCard, roomPeriod } from '@/components/RoomCard';
import { useAuth } from '@/hooks/useAuth';
import { useRecentExpenses } from '@/hooks/useRecentExpenses';
import { useMyRooms } from '@/hooks/useRooms';
import { formatForeign } from '@/lib/money';
import { colors } from '@/theme/tokens';
import type { MyRoom } from '@/types/domain';

const SOURCE_ICON = { receipt: Camera, card_image: Camera, card_text: MessageText, voice: Microphone, manual: EditPencil } as const;
const CARD_STEP = 260 + 12; // 카드 폭 + gap

const goRoom = (roomId: string) => router.push({ pathname: '/rooms/[roomId]', params: { roomId } });
const goCreate = () => router.push('/rooms/new');

function Header() {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <SplitoSymbol size={34} />
        <Wordmark size={26} />
      </View>
      <View className="flex-row gap-1.5">
        <Pressable accessibilityRole="button" accessibilityLabel="받을 계좌" onPress={() => router.push('/payout-account')} className="p-1.5">
          <Icon as={Bank} size={24} color={colors.ink[700]} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="내 정보" onPress={() => router.push('/settings')} className="p-1.5">
          <Icon as={User} size={24} color={colors.ink[700]} />
        </Pressable>
      </View>
    </View>
  );
}

export default function Home() {
  const { profile } = useAuth();
  const { data: rooms, isLoading, error, refetch, isRefetching } = useMyRooms();
  const [showSettled, setShowSettled] = useState(false);
  const active = (rooms ?? []).filter((r) => r.status !== 'settled');
  const settled = (rooms ?? []).filter((r) => r.status === 'settled');
  const featured = active.find((r) => r.status === 'settling') ?? active[0];
  const recent = useRecentExpenses(active);

  const refresh = () => Promise.all([refetch(), recent.refetch()]);
  const goAmount = (r: MyRoom) =>
    r.memberCount >= 2 ? router.push({ pathname: '/rooms/[roomId]/settle', params: { roomId: r.roomId } }) : goRoom(r.roomId);
  const addExpense = () =>
    featured ? router.push({ pathname: '/rooms/[roomId]/expenses/new', params: { roomId: featured.roomId } }) : goCreate();

  if (rooms?.length === 0) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-white">
        <ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 140, gap: 28 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <Header />
          <Text style={{ letterSpacing: -0.78, lineHeight: 34 }} className="font-extrabold text-[26px] text-ink">
            첫 여행을 만들어 볼까요?
          </Text>
          {/* 로그인 상태: 저장 후 '/'로 보내면 resolveEntryRoute가 합류 확인으로 보낸다. */}
          <InvitePasteBox onSaved={() => router.replace('/')} />
        </ScrollView>
        <BottomBar fade>
          <PrimaryButton title="여행 만들기" icon={Plus} onPress={goCreate} />
        </BottomBar>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 140, gap: 22 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} />}
      >
        <Header />
        {error && <Text className="text-[15px] text-danger">{error.message}</Text>}
        {!isLoading && !error && (
          <>
            <View className="gap-1">
              <Text className="text-[15px] text-ink-500">{profile?.nickname ? `${profile.nickname}님, 안녕하세요` : '안녕하세요'}</Text>
              <Text style={{ letterSpacing: -0.78, lineHeight: 34 }} className="font-extrabold text-[26px] text-ink">
                {active.length ? `진행 중인 여행이\n${active.length}개 있어요` : '진행 중인 여행이\n없어요'}
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_STEP}
              decelerationRate="fast"
              style={{ marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            >
              {active.map((r) => (
                <RoomCard
                  key={r.roomId}
                  room={r}
                  featured={r === featured}
                  onPress={() => goRoom(r.roomId)}
                  onPressAmount={() => goAmount(r)}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="새 여행 만들기"
                onPress={goCreate}
                className="min-h-[200px] w-[120px] items-center justify-center gap-2 rounded-hero border-2 border-dashed border-sky-200"
              >
                <Icon as={Plus} size={26} color={colors.primary.text} />
                <Text className="font-bold text-sm text-primary-text">새 여행</Text>
              </Pressable>
            </ScrollView>

            {recent.data.length > 0 && (
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between">
                  <Text className="font-bold text-[17px] text-ink">최근 기록</Text>
                  {active[0] && (
                    <Pressable accessibilityRole="button" onPress={() => goRoom(active[0].roomId)} hitSlop={8}>
                      <Text className="font-semibold text-sm text-primary-text">전체 보기</Text>
                    </Pressable>
                  )}
                </View>
                {recent.data.map((e) => (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    onPress={() => goRoom(e.roomId)}
                    className="flex-row items-center gap-3 py-2.5"
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-input bg-muted">
                      <Icon as={SOURCE_ICON[e.source as keyof typeof SOURCE_ICON] ?? EditPencil} size={21} color={colors.primary.text} />
                    </View>
                    <View className="flex-1 gap-[3px]">
                      <Text className="font-bold text-[15px] text-ink" numberOfLines={1}>
                        {e.merchant ?? '지출'}
                      </Text>
                      <Text className="text-[13px] text-ink-400" numberOfLines={1}>
                        {e.payerName} 결제 · {e.roomName}
                      </Text>
                    </View>
                    <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-[15px] text-ink">
                      {e.krwAmount !== null ? formatKrw(e.krwAmount) : formatForeign(e.amountOriginal, e.currency)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {settled.length > 0 && (
              <View className="gap-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showSettled }}
                  onPress={() => setShowSettled((v) => !v)}
                  className="flex-row items-center justify-between rounded-button bg-app px-4 py-3.5"
                >
                  <Text className="text-sm text-ink-500">정산 완료한 여행 {settled.length}개</Text>
                  <Icon as={showSettled ? NavArrowDown : NavArrowRight} size={18} color={colors.ink[300]} />
                </Pressable>
                {showSettled &&
                  settled.map((r) => (
                    <Pressable
                      key={r.roomId}
                      accessibilityRole="button"
                      onPress={() => goRoom(r.roomId)}
                      className="flex-row items-center justify-between px-4 py-3"
                    >
                      <View className="flex-1 gap-0.5 pr-3">
                        <Text className="font-bold text-[15px] text-ink" numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text className="text-[13px] text-ink-400">
                          {[roomPeriod(r), `${r.memberCount}명`].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Icon as={NavArrowRight} size={18} color={colors.ink[300]} />
                    </Pressable>
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <BottomBar fade row>
        <PrimaryButton title="지출 올리기" variant="dark" icon={Camera} grow onPress={addExpense} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="여행 만들기"
          onPress={goCreate}
          className="h-14 w-14 items-center justify-center rounded-button bg-primary active:bg-primary-press"
        >
          <Icon as={Plus} size={26} color={colors.primary.on} />
        </Pressable>
      </BottomBar>
    </SafeAreaView>
  );
}
