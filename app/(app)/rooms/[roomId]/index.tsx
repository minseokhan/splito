import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Coins, MoreHoriz, NavArrowLeft, NavArrowRight, Plus, UserPlus, Wallet, Xmark } from 'iconoir-react-native';
import { Fragment, useCallback, useMemo, useRef, useState, type ComponentType } from 'react';
import { Dimensions, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop, type SvgProps } from 'react-native-svg';

import { ActivityRow } from '@/components/ActivityRow';
import { ScheduleSection, type ScheduleRow } from '@/components/ScheduleSection';
import { ScheduleSheet, draftOf, type ScheduleDraft } from '@/components/ScheduleSheet';
import { Avatar } from '@/components/Avatar';
import { AvatarStack } from '@/components/AvatarStack';
import { ExpenseCard } from '@/components/ExpenseCard';
import { FlightIcon } from '@/components/FlightIcon';
import { Icon } from '@/components/Icon';
import { InviteSheet } from '@/components/InviteSheet';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { CATEGORY_ICON } from '@/components/categoryIcon';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import {
  useDeleteScheduleItem,
  useHiddenSchedules,
  useSaveScheduleItem,
  useScheduleItems,
  useSetScheduleHidden,
  useTripBooking,
} from '@/hooks/useBooking';
import { useFeed, useReconfirmPendingFx } from '@/hooks/useFeed';
import { useMyPayoutAccount } from '@/hooks/usePayoutAccount';
import { useRoomEvents } from '@/hooks/useRoomEvents';
import { useMyRooms, useRoomMembers } from '@/hooks/useRooms';
import { eventText, mergeActivity } from '@/lib/activity';
import { CATEGORIES, type CategoryCode } from '@/lib/category';
import { formatForeign } from '@/lib/money';
import { buildScheduleDays } from '@/lib/schedule';
import { buildTripDays, dayCaption, filterByCategory, filterSections, md, type TripDay } from '@/lib/tripDays';
import type { FeedRow } from '@/services/api';
import { loadDraft } from '@/services/drafts';
import type { RoomMember } from '@/types/domain';
import { colors } from '@/theme/tokens';

// expenses.flags → 배지 문구. 모르는 값은 보여주지 않는다.
const FLAG_LABEL: Record<string, string> = { auto_prepay: '자동 등록', budget_excluded: '예산 제외' };

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
  const myMemberId = members.find((m) => m.userId === myId)?.id;
  // 피드에는 지출만 둔다. 예외: 나에게 온 계좌 등록 요청은 등록으로 들어가는 유일한 입구라 남긴다(J6 3번).
  const myRequests = useMemo(
    () =>
      (events.data ?? []).filter(
        (e) => e.kind === 'payout_request' && e.targetMemberId === myMemberId && myAccount === null,
      ),
    [events.data, myMemberId, myAccount],
  );
  // groupFeed가 '여행 전' 섹션을 이미 맨 아래에 둔다.
  const sections = useMemo(
    () => mergeActivity(feed.data ?? [], myRequests, room?.startDate ?? null),
    [feed.data, myRequests, room?.startDate],
  );
  const pending = useMemo(() => (feed.data ?? []).filter((r) => r.krwAmount === null), [feed.data]);
  // 날짜 탭: 'all' | 'pre-trip' | 'YYYY-MM-DD'
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
  const visibleSections = useMemo(
    () => filterByCategory(filterSections(sections, day), category),
    [sections, day, category],
  );
  const offline = (feed.error as { code?: string } | null)?.code === 'OFFLINE';
  const insets = useSafeAreaInsets();
  // 참여자 팝오버: 아바타 스택 바로 아래에 띄우므로 누른 순간의 화면 좌표를 재서 연다.
  const avatarRef = useRef<View>(null);
  const [peopleAt, setPeopleAt] = useState<{ top: number; right: number } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  // 고정된 상단과 스크롤되는 목록을 구분하는 그림자. 맨 위에서는 띄우지 않는다.
  const [scrolled, setScrolled] = useState(false);
  const toast = useToast();
  // ── 패키지 일정: 예약이 붙은 방에서만 날짜별 피드 대신 일정 영역을 그린다(명세 §5)
  const { data: booking } = useTripBooking(roomId);
  const { data: scheduleItems = [] } = useScheduleItems(roomId);
  const { data: hiddenIds = [] } = useHiddenSchedules(roomId);
  const saveSchedule = useSaveScheduleItem(roomId);
  const deleteSchedule = useDeleteScheduleItem(roomId);
  const setHidden = useSetScheduleHidden(roomId);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const linked = !!booking;
  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    const name = (r: FeedRow) =>
      r.payerKind === 'pool' ? '공금' : (members.find((m) => m.id === r.payerMemberId)?.name ?? '참여자');
    return (feed.data ?? [])
      .filter((r) => category === null || r.category === category)
      .map((r) => {
        const local = r.currency !== 'KRW';
        const prepay = r.flags.includes('auto_prepay');
        return {
          id: r.id,
          scheduleId: r.scheduleId,
          paidLocalDate: r.paidLocalDate,
          krwAmount: r.krwAmount,
          title: r.merchant ?? '지출',
          who: `${name(r)} 결제${prepay ? ' · 하나투어' : ''}`,
          main: local ? formatForeign(r.amountOriginal, r.currency) : formatKrw(r.krwAmount ?? 0),
          mainLocal: local,
          sub: prepay ? '선결제' : local ? formatKrw(r.krwAmount ?? 0) : null,
          tags: r.flags.flatMap((f) => (FLAG_LABEL[f] ? [FLAG_LABEL[f]] : [])),
        };
      });
    // feed.data만 보면 되지만 lint 규칙이 feed 전체를 요구한다.
  }, [feed, category, members]);
  const scheduleDays = useMemo(
    () =>
      buildScheduleDays({
        items: scheduleItems,
        expenses: scheduleRows,
        hiddenIds,
        startDate: room?.startDate ?? null,
        endDate: room?.endDate ?? null,
      }),
    [scheduleItems, scheduleRows, hiddenIds, room?.startDate, room?.endDate],
  );
  const visibleDays = useMemo(
    () => (day === 'all' ? scheduleDays : scheduleDays.filter((d) => d.key === day)),
    [scheduleDays, day],
  );
  // 입력 화면에서 돌아올 때마다 기기의 작성 중 지출을 다시 확인한다.
  useFocusEffect(
    useCallback(() => {
      void loadDraft(roomId).then((d) => setHasDraft(!!d));
    }, [roomId]),
  );
  if (isLoading) return null;
  if (!room) {
    return (
      <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
        <NavBar />
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-base text-ink-700">여행을 찾을 수 없어요</Text>
        </View>
      </View>
    );
  }

  const userName = new Map(members.flatMap((m) => (m.userId ? [[m.userId, m.name] as const] : [])));
  // 아바타 색은 합류 순서(탈퇴 포함)로 고정한다 — 멤버 화면과 같은 규칙.
  const colorIndex = new Map(members.map((m, i) => [m.id, i]));
  const active = members.filter((m) => !m.leftAt);
  const people = active.map((m) => ({
    id: m.id,
    name: m.name,
    colorIndex: colorIndex.get(m.id) ?? 0,
    guest: m.kind === 'guest',
  }));
  // eventText는 profile id(actor)와 참여자 id(target)를 모두 이름으로 찾는다.
  const names = Object.fromEntries([...members.map((m) => [m.id, m.name]), ...userName]);
  // 참여자(게스트 포함) 2명 이상일 때만 정산·공금을 연다. 혼자면 초대 시트로 유도한다.
  const together = room.memberCount >= 2;
  const period = room.startDate ? `${md(room.startDate)} – ${room.endDate ? md(room.endDate) : ''}` : '';
  const go = (pathname: '/rooms/[roomId]/settle' | '/rooms/[roomId]/pool' | '/rooms/[roomId]/members' | '/rooms/[roomId]/edit') =>
    router.push({ pathname, params: { roomId } });

  // 상단 바 60: 뒤로 28 + [아이콘 박스 40 + 제목 17/600 · 기간 13] + 더보기 26.
  const topBar = (
    <View className="h-[60px] flex-row items-center gap-0.5 pl-1 pr-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="뒤로"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        hitSlop={4}
        className="p-2"
      >
        <Icon as={NavArrowLeft} size={28} color={colors.ink.DEFAULT} />
      </Pressable>
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        <View className="h-10 w-10 items-center justify-center rounded-chip border-[1.5px] border-line bg-white">
          <FlightIcon size={22} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-semibold text-[17px] text-ink" numberOfLines={1}>
            {room.name}
          </Text>
          {!!period && <Text className="text-[13px] text-ink-300">{period}</Text>}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="여행 방 설정"
        onPress={() => router.push({ pathname: '/rooms/[roomId]/settings', params: { roomId } })}
        hitSlop={4}
        className="p-2"
      >
        <Icon as={MoreHoriz} size={26} color={colors.ink.DEFAULT} />
      </Pressable>
    </View>
  );

  // 요약 카드: 135° 그라데이션(#36B6FF → primary). 전역 primary는 그대로 두고 여기서만 시작색을 쓴다.
  const summary = (
    <View className="mx-4 overflow-hidden rounded-card-lg">
      <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="tripHero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#36B6FF" />
            <Stop offset="1" stopColor={colors.primary.DEFAULT} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#tripHero)" />
      </Svg>
      <View className="gap-3.5 px-[18px] pb-3.5 pt-[18px]">
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="text-[13px] text-primary-on">총 지출</Text>
            <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[28px] text-primary-on">
              {formatKrw(room.totalKrw)}
            </Text>
          </View>
          <Pressable
            ref={avatarRef}
            accessibilityRole="button"
            accessibilityLabel={`참여자 ${people.length}명 보기`}
            hitSlop={8}
            onPress={() =>
              avatarRef.current?.measureInWindow((x, y, w, h) =>
                setPeopleAt({ top: y + h + 10, right: Math.max(16, Dimensions.get('window').width - (x + w)) }),
              )
            }
          >
            <AvatarStack people={people} size={30} />
          </Pressable>
        </View>
        <View className="flex-row rounded-button bg-[rgba(255,255,255,0.92)]">
          <Action
            label="정산 보기"
            icon={Coins}
            onPress={() => (together ? go('/rooms/[roomId]/settle') : setInviteOpen(true))}
          />
          <Action
            label="공금 지갑"
            icon={Wallet}
            iconColor={colors.warning.DEFAULT}
            divider
            onPress={() => (together ? go('/rooms/[roomId]/pool') : setInviteOpen(true))}
          />
          <Action label="초대하기" icon={UserPlus} divider onPress={() => setInviteOpen(true)} />
        </View>
      </View>
    </View>
  );

  const header = (
    <View
      className="bg-white pt-1"
      style={{ zIndex: 1, boxShadow: scrolled ? '0 6px 14px -8px rgba(19,25,39,.22)' : undefined }}
    >
      {summary}
      {(offline || !together || hasDraft || pending.length > 0) && (
        <View className="gap-2 px-5 pt-3.5">
          {offline && (
            <View className="rounded-input border border-warning-line bg-warning-banner px-4 py-3">
              <Text className="text-[13px] text-warning-deep">인터넷 연결이 끊겼어요. 기록은 연결 후 할 수 있어요.</Text>
            </View>
          )}
          {!together && <Text className="px-1 text-[13px] text-ink-500">모든 동행이 앱에 가입해야 정확히 나눠져요</Text>}
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
      )}
      {/* 전체 칸만 남으면(기간 미설정) 고를 게 없으므로 숨긴다 */}
      {days.length > 1 && <DayTabs days={days} selected={day} onPick={setDay} />}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}
      >
        {[{ code: null as CategoryCode | null, label: '전체' }, ...CATEGORIES].map((c) => {
          const on = category === c.code;
          const icon = c.code ? CATEGORY_ICON[c.code] : null;
          return (
            <Pressable
              key={c.code ?? 'all'}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setCategory(c.code)}
              className={`h-10 flex-row items-center gap-1.5 rounded-full px-3 ${on ? 'bg-sky-100' : 'bg-app'}`}
            >
              {icon && <Icon as={icon} size={17} color={on ? colors.primary.text : colors.ink[500]} />}
              <Text className={`font-semibold text-[15px] ${on ? 'text-primary-text' : 'text-ink-500'}`}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      {topBar}
      {header}
      <FlatList
        data={linked ? [] : visibleSections}
        keyExtractor={(s) => s.key}
        contentContainerStyle={{ paddingBottom: 140, flexGrow: 1 }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const next = e.nativeEvent.contentOffset.y > 0;
          setScrolled((v) => (v === next ? v : next));
        }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
        renderItem={({ item: section }) => {
          const sum = section.data.reduce((s, r) => s + ('kind' in r ? 0 : (r.krwAmount ?? 0)), 0);
          const hasExpense = section.data.some((r) => !('kind' in r));
          return (
            <View className="px-5 pt-6">
              <View className="flex-row justify-between py-1.5">
                <Text className="font-semibold text-[15px] text-ink-700">{section.title}</Text>
                {hasExpense && (
                  <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[15px] text-ink-500">
                    {formatKrw(sum)}
                  </Text>
                )}
              </View>
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
          );
        }}
        ListFooterComponent={
          linked ? (
            <ScheduleSection
              days={visibleDays}
              onEdit={(id) => {
                const it = scheduleItems.find((x) => x.id === id);
                if (it) setDraft(draftOf(it));
              }}
              onAddSchedule={(dayIndex) =>
                setDraft({ dayIndex, startTime: '', title: '', includes: [], optional: false, estAmount: 0 })
              }
              onAddExpense={(scheduleId) =>
                router.push({ pathname: '/rooms/[roomId]/expenses/new', params: { roomId, scheduleId } })
              }
              onSkip={(scheduleId) => setHidden.mutate({ scheduleId, hidden: true })}
              onUnhide={(dayIndex) =>
                scheduleItems
                  .filter((x) => x.dayIndex === dayIndex && hiddenIds.includes(x.id))
                  .forEach((x) => setHidden.mutate({ scheduleId: x.id, hidden: false }))
              }
              onOpenExpense={(expenseId) =>
                router.push({ pathname: '/rooms/[roomId]/expenses/[expenseId]', params: { roomId, expenseId } })
              }
            />
          ) : null
        }
        ListEmptyComponent={
          linked || feed.isLoading ? null : (
            <View className="flex-1 items-center justify-center gap-1.5 px-5 py-14">
              <Text className="text-center font-semibold text-base text-ink">
                {day === 'all' && category === null
                  ? '첫 지출을 올려보세요'
                  : category === null
                    ? '이 날은 지출이 없어요'
                    : '해당 품목의 지출이 없어요'}
              </Text>
              <Text className="text-center text-sm text-ink-400">
                {day === 'all' && category === null ? '영수증 사진 한 장이면 돼요' : '아래 버튼으로 지출을 올려보세요'}
              </Text>
            </View>
          )
        }
      />
      <BottomBar fade>
        <PrimaryButton
          title="지출 올리기"
          variant="dark"
          icon={Plus}
          onPress={() => router.push({ pathname: '/rooms/[roomId]/expenses/new', params: { roomId } })}
        />
      </BottomBar>
      <ScheduleSheet
        draft={draft}
        dayLabel={draft ? (scheduleDays.find((d) => d.dayIndex === draft.dayIndex)?.header ?? '') : ''}
        saving={saveSchedule.isPending}
        onClose={() => setDraft(null)}
        onSave={(d) =>
          saveSchedule.mutate(
            { id: d.id, roomId, dayIndex: d.dayIndex, startTime: d.startTime, title: d.title, includes: d.includes, optional: d.optional, estAmount: d.estAmount },
            {
              onSuccess: () => {
                setDraft(null);
                toast(d.id ? '일정을 수정했어요' : '일정을 추가했어요');
              },
            },
          )
        }
        onDelete={(id) =>
          deleteSchedule.mutate(id, {
            onSuccess: () => {
              setDraft(null);
              toast('일정을 삭제했어요. 연결된 지출은 그 외 지출로 옮겼어요');
            },
          })
        }
      />
      <InviteSheet roomId={roomId} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
      <PeoplePopover
        at={peopleAt}
        members={active}
        colorIndex={colorIndex}
        myId={myId}
        onClose={() => setPeopleAt(null)}
      />
    </View>
  );
}

type ActionProps = {
  label: string;
  icon: ComponentType<SvgProps>;
  iconColor?: string;
  divider?: boolean;
  onPress: () => void;
};

// 요약 카드 액션 바 한 칸: 높이 44, 아이콘 18 + 14/600, 칸 사이 1px 구분선.
function Action({ label, icon, iconColor, divider, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 active:opacity-70 ${divider ? 'border-l border-line' : ''}`}
    >
      <Icon as={icon} size={18} color={iconColor ?? colors.primary.text} />
      <Text className="font-semibold text-sm text-ink">{label}</Text>
    </Pressable>
  );
}

const dayName = (d: TripDay) => (d.bottom === null ? d.top : d.key === 'pre-trip' ? d.bottom : dayCaption(d.key, null, null));

// 밑줄형 날짜 탭. 6칸까지는 균등 분할, 넘으면 가로 스크롤로 흘린다.
function DayTabs({ days, selected, onPick }: { days: TripDay[]; selected: string; onPick: (key: string) => void }) {
  const fit = days.length <= 6;
  const cells = days.map((d) => (
    <Pressable
      key={d.key}
      accessibilityRole="tab"
      accessibilityState={{ selected: selected === d.key }}
      accessibilityLabel={dayName(d)}
      onPress={() => onPick(d.key)}
      style={{ borderBottomWidth: 2.5, borderBottomColor: selected === d.key ? colors.ink.DEFAULT : 'transparent', marginBottom: -1 }}
      className={`${fit ? 'flex-1' : 'w-[58px]'} items-center pb-2.5 pt-1.5`}
    >
      {/* 요일 줄은 '전체'·'여행 전' 칸에서 비어도 높이를 차지해 숫자 기준선을 맞춘다 */}
      <Text className="h-4 text-[11px] leading-4 text-ink-300">{d.bottom === null ? '' : d.top}</Text>
      <Text
        className={`font-semibold text-[15px] ${selected === d.key ? 'text-ink' : 'text-ink-400'}`}
        numberOfLines={1}
      >
        {d.bottom ?? d.top}
      </Text>
    </Pressable>
  ));
  return (
    <View className="mt-3.5 border-b border-muted">
      {fit ? (
        <View className="flex-row px-2">{cells}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {cells}
        </ScrollView>
      )}
    </View>
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

type PeoplePopoverProps = {
  at: { top: number; right: number } | null;
  members: RoomMember[];
  colorIndex: Map<string, number>;
  myId: string | undefined;
  onClose: () => void;
};

// 아바타 스택 아래에 붙는 참여자 목록 카드. at은 스택을 누른 순간 잰 화면 좌표다.
function PeoplePopover({ at, members, colorIndex, myId, onClose }: PeoplePopoverProps) {
  return (
    <Modal visible={!!at} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1">
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="닫기" onPress={onClose} />
        {at && (
          <View
            className="rounded-card bg-white px-4 pb-2 pt-3"
            style={{
              position: 'absolute',
              top: at.top,
              right: at.right,
              minWidth: 212,
              maxWidth: 280,
              boxShadow: '0 12px 28px -8px rgba(19,25,39,.22)',
            }}
          >
            <View className="flex-row items-center justify-between gap-4 pb-1">
              <Text className="font-semibold text-[15px] text-ink">참여자 {members.length}명</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="참여자 목록 닫기" hitSlop={8} onPress={onClose}>
                <Icon as={Xmark} size={18} color={colors.ink[400]} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 264 }} showsVerticalScrollIndicator={false}>
              {members.map((m) => (
                <View key={m.id} className="flex-row items-center gap-2.5 py-2">
                  <Avatar name={m.name} colorIndex={colorIndex.get(m.id) ?? 0} guest={m.kind === 'guest'} size={28} />
                  <Text className="flex-1 text-[15px] text-ink" numberOfLines={1}>
                    {m.name}
                  </Text>
                  {(m.userId === myId || m.kind === 'guest') && (
                    <Text className="text-[13px] text-ink-300">{m.userId === myId ? '나' : '게스트'}</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}
