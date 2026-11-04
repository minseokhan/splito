import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  Coins,
  MoreHoriz,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  NavArrowUp,
  Plus,
  StatsUpSquare,
  UserPlus,
  ViewGrid,
  Wallet,
  Xmark,
} from 'iconoir-react-native';
import { Fragment, useCallback, useMemo, useRef, useState, type ComponentType } from 'react';
import { Dimensions, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import { ActivityRow } from '@/components/ActivityRow';
import { ScheduleSection, type ScheduleRow, type SpotCardState } from '@/components/ScheduleSection';
import { SpotSettleSheet } from '@/components/SpotSettleSheet';
import { ScheduleSheet, draftOf, type ScheduleDraft } from '@/components/ScheduleSheet';
import { Avatar } from '@/components/Avatar';
import { AvatarStack } from '@/components/AvatarStack';
import { ExpenseCard } from '@/components/ExpenseCard';
import { FlightIcon } from '@/components/FlightIcon';
import { Icon } from '@/components/Icon';
import { InviteSheet } from '@/components/InviteSheet';
import { MenuPopover, type MenuAnchor } from '@/components/MenuPopover';
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
import { useConfirmSpotTransfer, useOpenSpotSettle, useRoomSpotSettles, useSendSpotSettle } from '@/hooks/useSpotSettle';
import { eventText, mergeActivity } from '@/lib/activity';
import { CATEGORIES, categoryLabel, type CategoryCode } from '@/lib/category';
import { currencyFlag } from '@/lib/flag';
import { formatForeign } from '@/lib/money';
import { buildScheduleDays } from '@/lib/schedule';
import { qrProgress, spotStatusText, spotTotals } from '@/lib/spotSettle';
import { buildTripDays, filterByCategory, filterSections, tripDayText } from '@/lib/tripDays';
import type { FeedRow } from '@/services/api';
import { loadDraft } from '@/services/drafts';
import type { RoomMember } from '@/types/domain';
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
  // 기간 선택: 'all' | 'pre-trip' | 'YYYY-MM-DD'
  const [day, setDay] = useState('all');
  // 카테고리 필터: null = 전체
  const [category, setCategory] = useState<CategoryCode | null>(null);
  // 일정표/지출 내역 토글. null이면 아직 안 골랐다는 뜻 — 패키지 연동 방은 일정표가 기본이다.
  const [view, setView] = useState<'sched' | 'exp' | null>(null);
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
  // 팝오버 3종(참여자·기간·카테고리)은 누른 순간의 화면 좌표를 재서 그 아래에 띄운다.
  const avatarRef = useRef<View>(null);
  const pillRef = useRef<View>(null);
  const catRef = useRef<View>(null);
  const [peopleAt, setPeopleAt] = useState<{ top: number; right: number } | null>(null);
  const [pdayAt, setPdayAt] = useState<MenuAnchor | null>(null);
  const [catAt, setCatAt] = useState<MenuAnchor | null>(null);
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
          category: r.category,
          main: local ? formatForeign(r.amountOriginal, r.currency) : formatKrw(r.krwAmount ?? 0),
          mainLocal: local,
          sub: prepay ? '선결제' : local ? formatKrw(r.krwAmount ?? 0) : null,
        };
      });
    // feed.data만 보면 되지만 lint 규칙이 feed 전체를 요구한다.
  }, [feed, category, members]);
  // ── 이 자리 정산: 일정 카드의 상태 줄 + 바텀시트(명세 §1~§3)
  const [openSpotId, setOpenSpotId] = useState<string | null>(null);
  // 시트가 열려 있는 동안에는 짧게 다시 묻는다 — QR 참여는 앱 밖(웹)에서 일어난다.
  const { data: spots = [] } = useRoomSpotSettles(roomId, openSpotId !== null);
  const openSpot = useOpenSpotSettle(roomId);
  const sendSpot = useSendSpotSettle(roomId);
  const confirmSpot = useConfirmSpotTransfer(roomId);
  const openSpotSettle = (scheduleId: string) => {
    const known = spots.find((x) => x.scheduleId === scheduleId);
    if (known) return setOpenSpotId(known.id);
    openSpot.mutate(scheduleId, { onSuccess: (x) => setOpenSpotId(x.id), onError: (e) => toast((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요') });
  };
  // 보낸 정산만 카드에 상태 줄로 그린다. 문구·완료 판정은 여기서 만든다(컴포넌트는 표시만).
  const spotCards = useMemo(() => {
    const out = new Map<string, SpotCardState>();
    for (const x of spots) {
      if (!x.sentAt) continue;
      const picked = x.expenses.filter((e) => e.selected);
      const { share } = spotTotals(picked, x.participants.length);
      const { due, done } = qrProgress(x.participants, x.payerMemberId);
      out.set(x.scheduleId, {
        text: spotStatusText({ expenseCount: picked.length, people: x.participants.length, share, due, done }),
        done: due === 0 || done === due,
      });
    }
    return out;
  }, [spots]);
  const openSpotData = spots.find((x) => x.id === openSpotId) ?? null;

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
  // QR로 들어온 사람은 동행이 아니다 — 고르는 목록에서 뺀다(장부에는 그대로 있다).
  const active = members.filter((m) => !m.leftAt && !m.spotOnly);
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
  const go = (pathname: '/rooms/[roomId]/settle' | '/rooms/[roomId]/pool' | '/rooms/[roomId]/members' | '/rooms/[roomId]/edit') =>
    router.push({ pathname, params: { roomId } });
  // 패키지 연동 방은 일정표가 기본, 아니면 지출 내역만 있다(프로토타입 showSchedule/showFlat).
  const showSchedule = linked && view !== 'exp';
  const selectedDay = days.find((d) => d.key === day) ?? days[0];
  // 순잔액 부호: 음수면 내가 보낼 돈(홈 카드와 같은 규칙).
  const net = room.myNet;
  const netLabel = net < 0 ? '내가 보낼 돈' : net > 0 ? '내가 받을 돈' : '정산할 돈';
  const flag = currencyFlag(room.baseCurrency);
  // 메뉴는 누른 요소 아래로 8pt 띄운다. 오른쪽 정렬은 화면 폭에서 되짚는다.
  const rightOf = (x: number, w: number) => Math.max(16, Dimensions.get('window').width - (x + w));

  // 상단 바 60: 뒤로 28 + [아이콘 박스 40 + 제목 17/600] + 더보기 26.
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
          {/* 홈 카드와 같은 규칙: 기본 통화로 나라가 특정되면 국기, 아니면 비행기 */}
          {flag ? <Text className="text-[22px]">{flag}</Text> : <FlightIcon size={22} />}
        </View>
        <Text className="min-w-0 flex-1 font-semibold text-[17px] text-ink" numberOfLines={1}>
          {room.name}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="여행 방 설정"
        onPress={() => go('/rooms/[roomId]/edit')}
        hitSlop={4}
        className="p-2"
      >
        <Icon as={MoreHoriz} size={26} color={colors.ink.DEFAULT} />
      </Pressable>
    </View>
  );

  // 요약 영역(시안 08): 흰 배경 · 기간 pill + 아바타 / 총 지출 / 내 순잔액 박스 / 액션 3칸.
  const summary = (
    <View className="gap-4 px-5 pb-[18px] pt-1">
      <View className="flex-row items-center justify-between gap-3">
        <Pressable
          ref={pillRef}
          accessibilityRole="button"
          accessibilityLabel={`기간 선택 · ${tripDayText(selectedDay)}`}
          onPress={() => pillRef.current?.measureInWindow((x, y, _w, h) => setPdayAt({ top: y + h + 8, left: x }))}
          className="h-[34px] min-w-0 flex-row items-center gap-1.5 rounded-full bg-app px-3 active:opacity-70"
        >
          <Icon as={Calendar} size={16} color={colors.primary.text} />
          <Text className="min-w-0 shrink font-semibold text-sm text-ink" numberOfLines={1}>
            {tripDayText(selectedDay)}
          </Text>
          <Icon as={pdayAt ? NavArrowUp : NavArrowDown} size={16} color={colors.ink[300]} />
        </Pressable>
        <Pressable
          ref={avatarRef}
          accessibilityRole="button"
          accessibilityLabel={`참여자 ${people.length}명 보기`}
          hitSlop={8}
          onPress={() =>
            avatarRef.current?.measureInWindow((x, y, w, h) => setPeopleAt({ top: y + h + 10, right: rightOf(x, w) }))
          }
        >
          <AvatarStack people={people} size={30} />
        </Pressable>
      </View>
      <View>
        <Text className="text-sm text-ink-400">총 지출</Text>
        <Text style={{ fontVariant: ['tabular-nums'], letterSpacing: -1 }} className="font-semibold text-[30px] leading-[39px] text-ink">
          {formatKrw(room.totalKrw)}
        </Text>
      </View>
      <View className="-mt-1.5 flex-row items-center gap-3 rounded-button bg-sky-100 px-3.5 py-3.5">
        <Icon as={Coins} size={22} color={colors.primary.text} />
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] text-primary-text">{netLabel}</Text>
          <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[17px] text-ink">
            {formatKrw(Math.abs(net))}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => (together ? go('/rooms/[roomId]/settle') : setInviteOpen(true))}
          // 시안 실측 라운드 10 — 토큰에 없다.
          className="h-10 justify-center rounded-[10px] bg-ink px-4 active:opacity-80"
        >
          <Text className="font-semibold text-sm text-primary-on">정산 보기</Text>
        </Pressable>
      </View>
      <View className="flex-row gap-2">
        <Action
          label="공금 지갑"
          icon={Wallet}
          iconColor={colors.warning.DEFAULT}
          onPress={() => (together ? go('/rooms/[roomId]/pool') : setInviteOpen(true))}
        />
        <Action
          label="내 통계"
          icon={StatsUpSquare}
          iconColor={colors.success.DEFAULT}
          onPress={() => router.push({ pathname: '/rooms/[roomId]/my-stats', params: { roomId } })}
        />
        <Action label="초대하기" icon={UserPlus} iconColor={colors.primary.text} onPress={() => setInviteOpen(true)} />
      </View>
    </View>
  );

  const header = (
    <View
      className="bg-white"
      style={{ zIndex: 1, boxShadow: scrolled ? '0 6px 14px -8px rgba(19,25,39,.22)' : undefined }}
    >
      {summary}
      {(offline || !together || hasDraft || pending.length > 0) && (
        <View className="-mt-2.5 gap-2 px-5 pb-3.5">
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
      <View className="h-px bg-card-line" />
    </View>
  );

  // 지출 내역 | 카테고리 줄은 목록과 함께 스크롤된다(고정 머리는 요약까지).
  const listTop = (
      <View
        className="min-h-[28px] flex-row items-center justify-between gap-3 px-5 pb-2 pt-3.5"
        style={{ backgroundColor: showSchedule ? colors.app : '#FFFFFF' }}
      >
        {/* 일정표 토글은 패키지 연동 방에만 둔다. 아닌 방은 지출 내역뿐이다 */}
        {linked ? (
          <View className="flex-row items-center gap-2.5">
            <ViewTab label="일정표" icon={Calendar} on={showSchedule} onPress={() => setView('sched')} />
            <View className="h-3 w-px bg-line-off" />
            <ViewTab label="지출 내역" icon={Coins} on={!showSchedule} onPress={() => setView('exp')} />
          </View>
        ) : (
          <View className="flex-row items-center gap-1">
            <Icon as={Coins} size={15} color={colors.ink.DEFAULT} />
            <Text className="font-semibold text-sm text-ink">지출 내역</Text>
          </View>
        )}
        {!showSchedule && (
        <Pressable
          ref={catRef}
          accessibilityRole="button"
          accessibilityLabel={`카테고리 선택 · ${category ? categoryLabel(category) : '전체'}`}
          onPress={() => catRef.current?.measureInWindow((x, y, w, h) => setCatAt({ top: y + h + 8, right: rightOf(x, w) }))}
          hitSlop={8}
          className="flex-row items-center gap-1 py-0.5 active:opacity-70"
        >
          <Text className="font-semibold text-sm text-ink">{category ? categoryLabel(category) : '카테고리'}</Text>
          <Icon as={catAt ? NavArrowUp : NavArrowDown} size={16} color={colors.ink.DEFAULT} />
        </Pressable>
        )}
      </View>
  );

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      {topBar}
      {header}
      <FlatList
        data={showSchedule ? [] : visibleSections}
        keyExtractor={(s) => s.key}
        style={{ backgroundColor: showSchedule ? colors.app : '#FFFFFF' }}
        contentContainerStyle={{ paddingBottom: 140, flexGrow: 1 }}
        ListHeaderComponent={listTop}
        ItemSeparatorComponent={() => <View className="h-4" />}
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
            <View className="px-5 pt-1.5">
              <View className="flex-row justify-between py-1.5">
                <Text className="font-semibold text-[13px] text-ink-500">{section.title}</Text>
                {hasExpense && (
                  <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[13px] text-ink-500">
                    {formatKrw(sum)}
                  </Text>
                )}
              </View>
              {section.data.map((item, i) => (
                <Fragment key={item.id}>
                  {i > 0 && <View className="h-px bg-line-row" />}
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
          showSchedule ? (
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
              spots={spotCards}
              onSpot={openSpotSettle}
            />
          ) : null
        }
        ListEmptyComponent={
          showSchedule || feed.isLoading ? null : (
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

      {openSpotData && (
        <SpotSettleSheet
          key={openSpotData.id}
          spot={openSpotData}
          members={members}
          myMemberId={myMemberId}
          busy={sendSpot.isPending || confirmSpot.isPending}
          onClose={() => setOpenSpotId(null)}
          onSend={({ expenseIds, memberIds }) =>
            sendSpot.mutate(
              { spotId: openSpotData.id, expenseIds, memberIds },
              {
                onSuccess: () => toast('함께한 사람에게 정산 요청을 보냈어요'),
                onError: (e) => toast((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요'),
              },
            )
          }
          onConfirm={({ memberId, confirmed }) =>
            confirmSpot.mutate(
              { spotId: openSpotData.id, memberId, confirmed },
              {
                onSuccess: () =>
                  confirmed && toast(`${members.find((m) => m.id === memberId)?.name ?? ''}님 송금을 확인했어요`),
                onError: (e) => toast((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요'),
              },
            )
          }
        />
      )}
      <PeoplePopover
        at={peopleAt}
        members={active}
        colorIndex={colorIndex}
        myId={myId}
        onClose={() => setPeopleAt(null)}
      />
      <MenuPopover
        at={pdayAt}
        width={250}
        items={days.map((d) => ({ key: d.key, label: d.label, sub: d.sub, selected: d.key === day }))}
        onPick={(key) => {
          setDay(key);
          setPdayAt(null);
        }}
        onClose={() => setPdayAt(null)}
      />
      <MenuPopover
        at={catAt}
        width={200}
        items={[{ code: null as CategoryCode | null, label: '전체' }, ...CATEGORIES].map((c) => ({
          key: c.code ?? 'all',
          label: c.label,
          icon: c.code ? CATEGORY_ICON[c.code] : ViewGrid,
          selected: category === c.code,
        }))}
        onPick={(key) => {
          setCategory(key === 'all' ? null : (key as CategoryCode));
          setCatAt(null);
        }}
        onClose={() => setCatAt(null)}
      />
    </View>
  );
}

type ActionProps = {
  label: string;
  icon: ComponentType<SvgProps>;
  iconColor: string;
  onPress: () => void;
};

// 액션 3칸 한 칸: 높이 42, 라운드 12, 테두리 1.5, 아이콘 19 + 14/600.
function Action({ label, icon, iconColor, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-[42px] flex-1 flex-row items-center justify-center gap-1.5 rounded-chip border-[1.5px] border-line active:opacity-70"
    >
      <Icon as={icon} size={19} color={iconColor} />
      <Text className="font-semibold text-sm text-ink">{label}</Text>
    </Pressable>
  );
}

type ViewTabProps = { label: string; icon: ComponentType<SvgProps>; on: boolean; onPress: () => void };

// 일정표 | 지출 내역 토글. 배경 없이 굵기·색만 바뀐다(시안 08).
function ViewTab({ label, icon, on, onPress }: ViewTabProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={6}
      className="flex-row items-center gap-1 active:opacity-70"
    >
      <Icon as={icon} size={15} color={on ? colors.ink.DEFAULT : colors.ink[300]} />
      <Text className={`text-sm ${on ? 'font-semibold text-ink' : 'font-medium text-ink-300'}`}>{label}</Text>
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
      className={`min-h-[44px] flex-row items-center gap-2 rounded-button px-4 py-2.5 ${
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
