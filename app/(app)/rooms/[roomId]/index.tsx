import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Coins, MoreHoriz, NavArrowRight, Plus, UserPlus, Wallet } from 'iconoir-react-native';
import { Fragment, useCallback, useMemo, useState, type ComponentType } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import { ActivityRow } from '@/components/ActivityRow';
import { AvatarStack } from '@/components/AvatarStack';
import { BottomSheet } from '@/components/BottomSheet';
import { ExpenseCard } from '@/components/ExpenseCard';
import { Icon } from '@/components/Icon';
import { InviteSheet } from '@/components/InviteSheet';
import { formatKrw, Money } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useFeed, useReconfirmPendingFx } from '@/hooks/useFeed';
import { useMyPayoutAccount } from '@/hooks/usePayoutAccount';
import { useRoomEvents } from '@/hooks/useRoomEvents';
import { useMyRooms, useRoomMembers } from '@/hooks/useRooms';
import { eventText, mergeActivity } from '@/lib/activity';
import { loadDraft } from '@/services/drafts';
import { colors } from '@/theme/tokens';

// YYYY-MM-DD → "10.20"
const md = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}.${d}`;
};

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
  // groupFeed가 '여행 전' 섹션을 이미 맨 아래에 둔다.
  const sections = useMemo(
    () => mergeActivity(feed.data ?? [], events.data ?? [], room?.startDate ?? null),
    [feed.data, events.data, room?.startDate],
  );
  const pending = useMemo(() => (feed.data ?? []).filter((r) => r.krwAmount === null), [feed.data]);
  const offline = (feed.error as { code?: string } | null)?.code === 'OFFLINE';
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
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
      <SafeAreaView className="flex-1 bg-app">
        <NavBar />
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-[15px] text-ink-700">여행을 찾을 수 없어요</Text>
        </View>
      </SafeAreaView>
    );
  }

  const memberIdx = new Map(members.map((m, i) => [m.id, i]));
  const userName = new Map(members.flatMap((m) => (m.userId ? [[m.userId, m.name] as const] : [])));
  // eventText는 profile id(actor)와 참여자 id(target)를 모두 이름으로 찾는다.
  const names = Object.fromEntries([...members.map((m) => [m.id, m.name]), ...userName]);
  const myMemberId = members.find((m) => m.userId === myId)?.id;
  const people = members
    .filter((m) => !m.leftAt)
    .map((m) => ({ id: m.id, name: m.name, colorIndex: memberIdx.get(m.id) ?? 0, guest: m.kind === 'guest' }));
  // 참여자(게스트 포함) 2명 이상일 때만 정산·공금을 연다. 혼자면 초대 시트로 유도한다.
  const together = room.memberCount >= 2;
  const period = room.startDate ? ` · ${md(room.startDate)} – ${room.endDate ? md(room.endDate) : ''}` : '';
  const go = (pathname: '/rooms/[roomId]/settle' | '/rooms/[roomId]/pool' | '/rooms/[roomId]/members') =>
    router.push({ pathname, params: { roomId } });

  const header = (
    <View>
      <View className="gap-4 rounded-b-hero bg-primary px-5 pb-[22px]" style={{ paddingTop: insets.top }}>
        <View className="-mx-5">
          <NavBar
            title={room.name}
            align="center"
            color={colors.primary.on}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel="방 메뉴" onPress={() => setMenuOpen(true)} hitSlop={4} className="p-2">
                <Icon as={MoreHoriz} size={26} color={colors.primary.on} />
              </Pressable>
            }
          />
        </View>
        <View className="flex-row items-end justify-between">
          <View className="gap-0.5">
            <Text className="font-semibold text-sm text-primary-on">총 지출{period}</Text>
            <Text
              style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.03 * 32 }}
              className="font-extrabold text-[32px] text-primary-on"
            >
              {formatKrw(room.totalKrw)}
            </Text>
          </View>
          <AvatarStack people={people} size={32} ring={colors.primary.DEFAULT} />
        </View>
        <View className="flex-row gap-2">
          <Action
            label="정산 보기"
            icon={Coins}
            white
            onPress={() => (together ? go('/rooms/[roomId]/settle') : setInviteOpen(true))}
          />
          <Action label="공금 지갑" icon={Wallet} onPress={() => (together ? go('/rooms/[roomId]/pool') : setInviteOpen(true))} />
          <Action label="초대하기" icon={UserPlus} onPress={() => setInviteOpen(true)} />
        </View>
      </View>
      <View className="gap-2.5 px-5 pt-5">
        {offline && (
          <View className="rounded-input border border-warning-line bg-warning-banner px-4 py-3">
            <Text className="text-[13px] text-warning-deep">인터넷 연결이 끊겼어요. 기록은 연결 후 할 수 있어요.</Text>
          </View>
        )}
        <View
          className="flex-row items-center justify-between rounded-card bg-white px-4 py-3.5"
          style={{ boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' }}
        >
          <Text className="font-bold text-[15px] text-ink">내 정산</Text>
          <Money net={room.myNet} />
        </View>
        {!together && (
          <Text className="px-1 text-[13px] text-ink-500">모든 동행이 앱에 가입해야 정확히 나눠져요</Text>
        )}
        {hasDraft && (
          <Banner
            text="작성 중인 지출 1건 · 이어서 쓰기"
            onPress={() => router.push({ pathname: '/rooms/[roomId]/expenses/review', params: { roomId } })}
          />
        )}
        {pending.length > 0 && (
          <Banner
            warning
            disabled={reconfirm.isPending}
            text={reconfirm.isPending ? '환율을 다시 확인하고 있어요' : `환율 대기 ${pending.length}건 · 다시 확정하기`}
            onPress={() => reconfirm.mutate(pending)}
          />
        )}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-app">
      <FlatList
        data={sections}
        keyExtractor={(s) => s.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 140, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
        renderItem={({ item: section }) => {
          const sum = section.data.reduce((s, r) => s + ('kind' in r ? 0 : (r.krwAmount ?? 0)), 0);
          const hasExpense = section.data.some((r) => !('kind' in r));
          return (
            <View className="gap-2.5 px-5 pt-[22px]">
              <View className="flex-row justify-between px-1">
                <Text className="font-bold text-[13px] text-ink-500">{section.title}</Text>
                {hasExpense && (
                  <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[13px] text-ink-500">
                    {formatKrw(sum)}
                  </Text>
                )}
              </View>
              <View className="rounded-card bg-white px-4 py-1" style={{ boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' }}>
                {section.data.map((item, i) => (
                  <Fragment key={item.id}>
                    {i > 0 && <View className="h-px bg-muted" />}
                    {'kind' in item ? (
                      <ActivityRow
                        text={eventText(item, names)}
                        // 나에게 온 계좌 요청이고 아직 미등록이면 탭해서 바로 등록한다(J6 3번).
                        onPress={
                          item.kind === 'payout_request' && item.targetMemberId === myMemberId && myAccount === null
                            ? () => router.push('/payout-account')
                            : undefined
                        }
                      />
                    ) : (
                      <ExpenseCard
                        row={item}
                        payerName={
                          item.payerKind === 'pool' ? '공금' : (members.find((m) => m.id === item.payerMemberId)?.name ?? '참여자')
                        }
                        recorderName={userName.get(item.createdBy ?? '') ?? '탈퇴한 사용자'}
                        onPress={() =>
                          router.push({ pathname: '/rooms/[roomId]/expenses/[expenseId]', params: { roomId, expenseId: item.id } })
                        }
                      />
                    )}
                  </Fragment>
                ))}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          feed.isLoading ? null : (
            <View className="flex-1 items-center justify-center px-5 py-10">
              <Text className="text-center text-[15px] text-ink-500">첫 지출을 올려보세요. 영수증 사진 한 장이면 돼요.</Text>
            </View>
          )
        }
      />
      {/* 스크롤해도 상태바 영역은 히어로 색을 유지한다 */}
      <View pointerEvents="none" className="absolute left-0 right-0 top-0 bg-primary" style={{ height: insets.top }} />
      <BottomBar bg={colors.app} fade>
        <PrimaryButton
          title="지출 올리기"
          variant="dark"
          icon={Plus}
          onPress={() => router.push({ pathname: '/rooms/[roomId]/expenses/new', params: { roomId } })}
        />
      </BottomBar>
      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <View>
          <MenuRow
            label="멤버"
            onPress={() => {
              setMenuOpen(false);
              go('/rooms/[roomId]/members');
            }}
          />
          {together && (
            <MenuRow
              label="공금 지갑"
              onPress={() => {
                setMenuOpen(false);
                go('/rooms/[roomId]/pool');
              }}
            />
          )}
        </View>
      </BottomSheet>
      <InviteSheet roomId={roomId} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
    </View>
  );
}

type ActionProps = { label: string; icon: ComponentType<SvgProps>; white?: boolean; onPress: () => void };

// 히어로 액션 칸: radius 14, padding 12×10, 아이콘 22 + 13/700.
function Action({ label, icon, white, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-1 items-center gap-1.5 rounded-input px-2.5 py-3 active:translate-y-px ${white ? 'bg-white' : 'bg-[rgba(255,255,255,0.55)]'}`}
    >
      <Icon as={icon} size={22} color={white ? colors.primary.text : colors.primary.on} />
      <Text className={`font-bold text-[13px] ${white ? 'text-ink' : 'text-primary-on'}`}>{label}</Text>
    </Pressable>
  );
}

type BannerProps = { text: string; onPress: () => void; warning?: boolean; disabled?: boolean };

function Banner({ text, onPress, warning, disabled }: BannerProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center gap-2 rounded-button px-4 py-3 ${
        warning ? 'border border-warning-line bg-warning-banner' : 'border-[1.5px] border-line bg-white'
      }`}
    >
      <Text className={`flex-1 font-semibold text-[15px] ${warning ? 'text-warning' : 'text-primary-text'}`}>{text}</Text>
      <Icon as={NavArrowRight} size={18} color={warning ? colors.warning.DEFAULT : colors.ink[300]} />
    </Pressable>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="h-14 flex-row items-center justify-between">
      <Text className="font-semibold text-base text-ink">{label}</Text>
      <Icon as={NavArrowRight} size={18} color={colors.ink[300]} />
    </Pressable>
  );
}
