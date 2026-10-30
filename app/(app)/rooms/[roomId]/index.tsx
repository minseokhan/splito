import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityRow } from '@/components/ActivityRow';
import { ExpenseCard } from '@/components/ExpenseCard';
import { InputMethodSheet } from '@/components/InputMethodSheet';
import { formatKrw, Money } from '@/components/Money';
import { StatusChip } from '@/components/StatusChip';
import { useAuth } from '@/hooks/useAuth';
import { useFeed, useReconfirmPendingFx } from '@/hooks/useFeed';
import { useMyPayoutAccount } from '@/hooks/usePayoutAccount';
import { useRoomEvents } from '@/hooks/useRoomEvents';
import { useMyRooms, useRoomMembers } from '@/hooks/useRooms';
import { eventText, mergeActivity } from '@/lib/activity';
import { loadDraft } from '@/services/drafts';
import { colors } from '@/theme/tokens';

export default function RoomHome() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  // 순잔액·총지출은 서버 my_rooms 값만 쓴다.
  const { data: rooms, isLoading } = useMyRooms();
  const room = rooms?.find((r) => r.roomId === roomId);
  const feed = useFeed(roomId);
  const { data: members = [] } = useRoomMembers(roomId);
  const reconfirm = useReconfirmPendingFx(roomId);
  const events = useRoomEvents(roomId);
  const myId = useAuth().session?.user.id;
  const { data: myAccount } = useMyPayoutAccount();
  const sections = useMemo(
    () => mergeActivity(feed.data ?? [], events.data ?? [], room?.startDate ?? null),
    [feed.data, events.data, room?.startDate],
  );
  const pending = useMemo(() => (feed.data ?? []).filter((r) => r.krwAmount === null), [feed.data]);
  const offline = (feed.error as { code?: string } | null)?.code === 'OFFLINE';
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

  const memberIdx = new Map(members.map((m, i) => [m.id, i]));
  const userName = new Map(members.flatMap((m) => (m.userId ? [[m.userId, m.name] as const] : [])));
  // eventText는 profile id(actor)와 참여자 id(target)를 모두 이름으로 찾는다.
  const names = Object.fromEntries([...members.map((m) => [m.id, m.name]), ...userName]);
  const myMemberId = members.find((m) => m.userId === myId)?.id;

  return (
    <SafeAreaView className="flex-1 bg-white">
      {offline && (
        <View className="bg-pending-bg px-5 py-2">
          <Text className="text-[13px] text-pending-fg">인터넷 연결이 끊겼어요. 기록은 연결 후 할 수 있어요.</Text>
        </View>
      )}
      <View className="gap-2 px-5 pt-6">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 font-bold text-[22px] text-ink-900" numberOfLines={1}>
            {room.name}
          </Text>
          {/* 참여자(게스트 포함) 2명 이상일 때만 정산 메뉴를 연다 */}
          {room.memberCount >= 2 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="정산 보기"
              onPress={() => router.push({ pathname: '/rooms/[roomId]/settle', params: { roomId } })}
              className="h-11 justify-center px-2"
            >
              <Text className="font-medium text-[15px] text-sky-900">정산</Text>
            </Pressable>
          )}
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
        {pending.length > 0 && (
          <Pressable
            accessibilityRole="button"
            disabled={reconfirm.isPending}
            onPress={() => reconfirm.mutate(pending)}
            className="h-11 justify-center rounded-lg bg-pending-bg px-4"
          >
            <Text className="font-medium text-[15px] text-pending-fg">
              {reconfirm.isPending ? '환율을 다시 확인하고 있어요' : `환율 대기 ${pending.length}건 · 다시 확정하기`}
            </Text>
          </Pressable>
        )}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        className="mt-4 flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 88, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text className="mb-2 mt-6 font-semibold text-[17px] text-ink-900">{section.title}</Text>
        )}
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={({ item }) => {
          if ('kind' in item) {
            // 나에게 온 계좌 요청이고 아직 미등록이면 탭해서 바로 등록한다(J6 3번).
            const toMe = item.kind === 'payout_request' && item.targetMemberId === myMemberId && myAccount === null;
            return (
              <ActivityRow text={eventText(item, names)} onPress={toMe ? () => router.push('/payout-account') : undefined} />
            );
          }
          const payer = item.payerKind === 'pool' ? undefined : members.find((m) => m.id === item.payerMemberId);
          return (
            <ExpenseCard
              row={item}
              payerName={item.payerKind === 'pool' ? '공금' : (payer?.name ?? '참여자')}
              recorderName={userName.get(item.createdBy ?? '') ?? '탈퇴한 사용자'}
              payerColorIndex={payer ? (memberIdx.get(payer.id) ?? 0) : 0}
              payerGuest={payer?.kind === 'guest'}
              onPress={() =>
                router.push({ pathname: '/rooms/[roomId]/expenses/[expenseId]', params: { roomId, expenseId: item.id } })
              }
            />
          );
        }}
        ListEmptyComponent={
          feed.isLoading ? null : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-center text-[15px] text-ink-700">
                첫 지출을 올려보세요. 영수증 사진 한 장이면 돼요.
              </Text>
            </View>
          )
        }
      />
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
