import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Calendar, Coins, MoreHoriz, NavArrowRight, Plus, UserPlus, Wallet } from 'iconoir-react-native';
import { Fragment, useCallback, useMemo, useState, type ComponentType } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
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
import { CATEGORY_ICON } from '@/components/categoryIcon';
import { useAuth } from '@/hooks/useAuth';
import { useFeed, useReconfirmPendingFx } from '@/hooks/useFeed';
import { useMyPayoutAccount } from '@/hooks/usePayoutAccount';
import { useRoomEvents } from '@/hooks/useRoomEvents';
import { useMyRooms, useRoomMembers } from '@/hooks/useRooms';
import { eventText, mergeActivity } from '@/lib/activity';
import { CATEGORIES, type CategoryCode } from '@/lib/category';
import {
  buildTripDays,
  dayCaption,
  filterByCategory,
  filterSections,
  hasExpenseByDay,
  md,
  monthLabel,
  type TripDay,
} from '@/lib/tripDays';
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
  // groupFeed가 '여행 전' 섹션을 이미 맨 아래에 둔다.
  const sections = useMemo(
    () => mergeActivity(feed.data ?? [], events.data ?? [], room?.startDate ?? null),
    [feed.data, events.data, room?.startDate],
  );
  const pending = useMemo(() => (feed.data ?? []).filter((r) => r.krwAmount === null), [feed.data]);
  // 날짜 캘린더: 'all' | 'pre-trip' | 'YYYY-MM-DD'
  const [day, setDay] = useState('all');
  // 카테고리 필터: null = 전체
  const [category, setCategory] = useState<CategoryCode | null>(null);
  const days = useMemo(
    () =>
      buildTripDays({
        startDate: room?.startDate ?? null,
        endDate: room?.endDate ?? null,
        sectionKeys: sections.map((s) => s.key),
      }),
    [room?.startDate, room?.endDate, sections],
  );
  const dots = useMemo(() => hasExpenseByDay(sections), [sections]);
  const visibleSections = useMemo(
    () => filterByCategory(filterSections(sections, day), category),
    [sections, day, category],
  );
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
          <Text className="text-base text-ink-700">여행을 찾을 수 없어요</Text>
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

  // 스크롤해도 고정되는 파란 히어로.
  const hero = (
    <View className="gap-4 rounded-b-hero bg-primary px-5 pb-[22px]" style={{ paddingTop: insets.top }}>
      <View className="-mx-5">
        <NavBar
          title={room.name}
          titleSize={19}
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
            style={{ fontVariant: ['tabular-nums'], letterSpacing: -1 }}
            className="font-semibold text-[30px] text-primary-on"
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
        <Action
          label="공금 지갑"
          icon={Wallet}
          iconColor={colors.warning.DEFAULT}
          onPress={() => (together ? go('/rooms/[roomId]/pool') : setInviteOpen(true))}
        />
        <Action label="초대하기" icon={UserPlus} onPress={() => setInviteOpen(true)} />
      </View>
    </View>
  );

  const header = (
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
        <Text className="font-semibold text-base text-ink">내 정산</Text>
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
      {/* 전체 칸만 남으면(기간 미설정) 고를 게 없으므로 숨긴다 */}
      {days.length > 1 && (
        <DayPicker
          days={days}
          selected={day}
          dots={dots}
          caption={dayCaption(day, room.startDate, room.endDate)}
          month={monthLabel(day, room.startDate)}
          onPick={setDay}
        />
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-2 px-5">
        {[{ code: null as CategoryCode | null, label: '전체' }, ...CATEGORIES].map((c) => {
          const on = category === c.code;
          const icon = c.code ? CATEGORY_ICON[c.code] : null;
          return (
            <Pressable
              key={c.code ?? 'all'}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setCategory(c.code)}
              className={`h-[37px] flex-row items-center gap-1.5 rounded-full border px-3.5 ${on ? 'border-ink bg-ink' : 'border-line bg-white'}`}
            >
              {icon && <Icon as={icon} size={16} color={on ? '#FFFFFF' : colors.ink[400]} />}
              <Text className={`font-semibold text-sm ${on ? 'text-white' : 'text-ink-500'}`}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View className="flex-1 bg-app">
      {hero}
      <FlatList
        data={visibleSections}
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
                <Text className="font-semibold text-[13px] text-ink-500">{section.title}</Text>
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
          feed.isLoading ? null : day === 'all' && category === null ? (
            <View className="flex-1 items-center justify-center px-5 py-10">
              <Text className="text-center text-base text-ink-500">첫 지출을 올려보세요. 영수증 사진 한 장이면 돼요.</Text>
            </View>
          ) : (
            <View className="mx-5 mt-[22px] items-center gap-1.5 rounded-card bg-white px-4 py-7">
              <Text className="font-semibold text-base text-ink">
                {category === null ? '이 날은 지출이 없어요' : '조건에 맞는 지출이 없어요'}
              </Text>
              <Text className="text-sm text-ink-400">아래 버튼으로 지출을 올려보세요</Text>
            </View>
          )
        }
      />
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

type ActionProps = {
  label: string;
  icon: ComponentType<SvgProps>;
  white?: boolean;
  iconColor?: string;
  onPress: () => void;
};

// 히어로 액션 칸: radius 14, padding 12×10, gap 6, 아이콘 22 + 13/600.
function Action({ label, icon, white, iconColor, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-1 items-center gap-1.5 rounded-input px-2.5 py-3 active:translate-y-px ${white ? 'bg-white' : 'bg-[rgba(255,255,255,0.55)]'}`}
    >
      <Icon as={icon} size={22} color={iconColor ?? (white ? colors.primary.text : colors.primary.on)} />
      <Text className={`font-semibold text-[13px] ${white ? 'text-ink' : 'text-primary-on'}`}>{label}</Text>
    </Pressable>
  );
}

type DayPickerProps = {
  days: TripDay[];
  selected: string;
  dots: Record<string, boolean>;
  caption: string;
  month: string;
  onPick: (key: string) => void;
};

// 날짜 캘린더 줄. 6칸까지는 균등 분할, 넘으면 가로 스크롤로 흘린다.
function DayPicker({ days, selected, dots, caption, month, onPick }: DayPickerProps) {
  const fit = days.length <= 6;
  const cells = days.map((d) => (
    <DayCell
      key={d.key}
      day={d}
      fit={fit}
      selected={selected === d.key}
      dot={!!dots[d.key]}
      onPress={() => onPick(d.key)}
    />
  ));
  return (
    <View
      className="gap-2.5 rounded-card bg-white px-3 pb-3 pt-3.5"
      style={{ boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' }}
    >
      <View className="flex-row items-center justify-between px-1">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Calendar} size={18} color={colors.primary.text} />
          <Text className="font-semibold text-base text-ink">{month}</Text>
        </View>
        <Text className="text-[13px] text-ink-500">{caption}</Text>
      </View>
      {fit ? (
        <View className="flex-row gap-1">{cells}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-3"
          contentContainerStyle={{ gap: 4, paddingHorizontal: 12 }}
        >
          {cells}
        </ScrollView>
      )}
    </View>
  );
}

const dayName = (key: string) => (key === 'all' ? '전체' : key === 'pre-trip' ? '여행 전' : dayCaption(key, null, null));

function DayCell({
  day,
  fit,
  selected,
  dot,
  onPress,
}: {
  day: TripDay;
  fit: boolean;
  selected: boolean;
  dot: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${dayName(day.key)}${dot ? ', 지출 있음' : ''}`}
      onPress={onPress}
      className={`${fit ? 'flex-1' : 'w-[52px]'} items-center justify-center gap-0.5 rounded-input pb-1.5 pt-2 ${selected ? 'bg-ink' : ''}`}
    >
      {/* '전체' 칸은 한 줄. 줄 수가 달라도 다른 칸이 높이를 정하므로 가운데 정렬로 맞춘다. */}
      {day.bottom === null ? (
        <Text className={`font-semibold text-base ${selected ? 'text-white' : 'text-ink'}`}>{day.top}</Text>
      ) : (
        <>
          <Text className={`text-xs ${selected ? 'text-on-dark-sub' : 'text-ink-400'}`}>{day.top}</Text>
          <Text className={`font-semibold text-base ${selected ? 'text-white' : 'text-ink'}`}>{day.bottom}</Text>
          <View className={`h-[5px] w-[5px] rounded-full ${dot ? (selected ? 'bg-sky-300' : 'bg-primary') : ''}`} />
        </>
      )}
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
      <Text className={`flex-1 font-semibold text-base ${warning ? 'text-warning' : 'text-primary-text'}`}>{text}</Text>
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
