import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Coins,
  DataTransferBoth,
  MoreHoriz,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  NavArrowUp,
  Plus,
  Search,
  StatsUpSquare,
  ViewGrid,
  Wallet,
  Xmark,
} from 'iconoir-react-native';
import { Fragment, useCallback, useMemo, useRef, useState, type ComponentType } from 'react';
import { Dimensions, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { ScheduleEmpty } from '@/components/trip/ScheduleEmpty';
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
import { buildScheduleDays, type ScheduleItem } from '@/lib/schedule';
import { qrProgress, spotStatusText, spotTotals } from '@/lib/spotSettle';
import { buildTripDays, dateTab, filterByCategory, nearestDay } from '@/lib/tripDays';
import type { FeedRow } from '@/services/api';
import { loadDraft } from '@/services/drafts';
import type { RoomMember } from '@/types/domain';
import { colors } from '@/theme/tokens';

// Modal 두 개를 연달아 띄우면 iOS가 뒤의 것을 무시한다. 팝오버가 닫히는 시간만큼 미룬다.
const AFTER_POPOVER_MS = 300;

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
  // 지출 내역은 최신순(노션 11번). groupFeed가 '여행 전' 섹션을 맨 아래에 둔다.
  const sections = useMemo(
    () => mergeActivity(feed.data ?? [], myRequests, room?.startDate ?? null),
    [feed.data, myRequests, room?.startDate],
  );
  const pending = useMemo(() => (feed.data ?? []).filter((r) => r.krwAmount === null), [feed.data]);
  // 카테고리 필터: null = 전체. 지출 내역 보기에서만 쓴다.
  const [category, setCategory] = useState<CategoryCode | null>(null);
  // 일정표 / 지출 내역. 두 종류 방 모두 일정표가 기본이다(노션 19번 ①).
  const [view, setView] = useState<'sched' | 'exp'>('sched');
  // 날짜 탭: [전체] [여행 전] [날짜…]. 누르면 그 날짜로 스크롤한다(필터 아님).
  const days = useMemo(
    () =>
      buildTripDays({
        startDate: room?.startDate ?? null,
        endDate: room?.endDate ?? null,
        sectionKeys: sections.map((s) => s.key),
      }),
    [room?.startDate, room?.endDate, sections],
  );
  const visibleSections = useMemo(() => filterByCategory(sections, category), [sections, category]);
  const offline = (feed.error as { code?: string } | null)?.code === 'OFFLINE';
  const insets = useSafeAreaInsets();
  // 팝오버(참여자·카테고리·일정 메뉴)는 누른 순간의 화면 좌표를 재서 그 아래에 띄운다.
  const avatarRef = useRef<View>(null);
  const catRef = useRef<View>(null);
  const [peopleAt, setPeopleAt] = useState<{ top: number; right: number } | null>(null);
  const [catAt, setCatAt] = useState<MenuAnchor | null>(null);
  const [moreAt, setMoreAt] = useState<{ item: ScheduleItem; top: number } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  // 고정된 상단과 스크롤되는 목록을 구분하는 그림자. 맨 위에서는 띄우지 않는다.
  const [scrolled, setScrolled] = useState(false);
  const toast = useToast();
  // ── 일정표: 자유여행·패키지 모두. 패키지(예약 연동)만 시간·포함 사항·이 자리 정산이 있다.
  const { data: booking } = useTripBooking(roomId);
  const { data: scheduleItems = [] } = useScheduleItems(roomId);
  const { data: hiddenIds = [] } = useHiddenSchedules(roomId);
  const saveSchedule = useSaveScheduleItem(roomId);
  const deleteSchedule = useDeleteScheduleItem(roomId);
  const setHidden = useSetScheduleHidden(roomId);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const pkg = !!booking;
  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    const name = (r: FeedRow) =>
      r.payerKind === 'pool' ? '공금' : (members.find((m) => m.id === r.payerMemberId)?.name ?? '참여자');
    return (feed.data ?? []).map((r) => {
      const local = r.currency !== 'KRW';
      const prepay = r.flags.includes('auto_prepay');
      return {
        id: r.id,
        scheduleId: r.scheduleId,
        paidLocalDate: r.paidLocalDate,
        paidLocalTime: r.paidLocalTime,
        createdAt: r.createdAt,
        krwAmount: r.krwAmount,
        title: r.merchant ?? '지출',
        who: `${name(r)} 결제${prepay ? ' · 하나투어' : ''}`,
        category: r.category,
        // 외화 크게 + 원화 작게 / 원화 결제는 원화만(노션 11번)
        main: local ? formatForeign(r.amountOriginal, r.currency) : formatKrw(r.krwAmount ?? 0),
        mainLocal: local,
        sub: local && r.krwAmount !== null ? formatKrw(r.krwAmount) : null,
      };
    });
    // feed.data만 보면 되지만 lint 규칙이 feed 전체를 요구한다.
  }, [feed, members]);
  // ── 이 자리 정산: 일정 카드의 칩·상태 줄 + 바텀시트(명세 §1~§3)
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
  // 시트의 날짜 칩·날짜 표시. 여행 전에는 일정을 둘 수 없다.
  const sheetDays = useMemo(
    () => scheduleDays.filter((d) => d.dayIndex > 0).map((d) => ({ dayIndex: d.dayIndex, label: d.header })),
    [scheduleDays],
  );

  // ── 날짜 탭 바로가기(노션 19번 ②). 좌표는 모두 ScrollView 콘텐츠 기준으로 되짚는다.
  const scrollRef = useRef<ScrollView>(null);
  const lay = useRef({ body: 0, list: 0, tabs: 0, viewport: 0, days: new Map<string, { y: number; h: number }>() });
  const [activeTab, setActiveTab] = useState('all');
  const [bottomPad, setBottomPad] = useState(140);
  const dayTop = (key: string) => lay.current.body + lay.current.list + (lay.current.days.get(key)?.y ?? 0) - lay.current.tabs;
  // 마지막 날짜도 탭 바로 아래까지 올라오도록 아래 여백을 확보한다.
  const fitBottom = () => {
    const last = [...lay.current.days.values()].sort((a, b) => b.y - a.y)[0];
    const next = Math.max(140, last ? lay.current.viewport - lay.current.tabs - last.h : 140);
    setBottomPad((v) => (v === next ? v : next));
  };
  const onDayLayout = (key: string, y: number, h: number) => {
    lay.current.days.set(key, { y, h });
    fitBottom();
  };
  const switchView = (v: 'sched' | 'exp') => {
    lay.current.days.clear();
    setView(v);
  };
  const tabKeys = days.filter((d) => d.key !== 'all').map((d) => d.key);
  const goTab = (key: string) => {
    if (key === 'all') return scrollRef.current?.scrollTo({ y: 0, animated: true });
    let target: string | null = key;
    if (!lay.current.days.has(key)) {
      // 지출 없는 날(지출 내역): 가장 가까운 날로 보내고 알려 준다.
      target = nearestDay(tabKeys, new Set(lay.current.days.keys()), key);
      toast(`${days.find((d) => d.key === key)?.label ?? '이 날'}에는 지출이 없어요`);
      if (!target) return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, dayTop(target)) + 1, animated: true });
  };

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
  // 기간이 없는 방은 날짜를 못 만들어 일정표가 없다 → 지출 내역만, 전환 버튼도 없다.
  const hasSchedule = !!room.startDate;
  const showSchedule = hasSchedule && view === 'sched';
  // 일정·지출이 하나도 없는 자유여행 방은 일정표 첫 화면(노션 16번).
  const firstRun = !pkg && scheduleItems.length === 0 && (feed.data ?? []).length === 0 && !feed.isLoading;
  // 가입 안내는 직접 만든 방에서만 — 패키지 연동 방은 동행이 예약으로 정해져 있다.
  const needJoinHint = !together && !pkg;
  const flag = currencyFlag(room.baseCurrency);
  // 메뉴는 누른 요소 아래로 8pt 띄운다. 오른쪽 정렬은 화면 폭에서 되짚는다.
  const rightOf = (x: number, w: number) => Math.max(16, Dimensions.get('window').width - (x + w));
  const newDraft = (dayIndex: number, position?: number): ScheduleDraft => ({
    dayIndex,
    position,
    startTime: '',
    title: '',
    includes: [],
    optional: false,
    estAmount: 0,
  });

  // 상단 바 60: 뒤로 28 + [아이콘 박스 40 + 제목 17/600] + 검색·더보기.
  const topBar = (
    <View
      className="h-[60px] flex-row items-center gap-0.5 bg-white pl-1 pr-3"
      style={{ zIndex: 1, boxShadow: scrolled ? '0 6px 14px -8px rgba(19,25,39,.22)' : undefined }}
    >
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
      {/* 검색 범위는 아직 정하지 않았다(노션 19번 질문 사항) */}
      <Pressable accessibilityRole="button" accessibilityLabel="검색" onPress={() => toast('검색은 준비 중이에요')} hitSlop={4} className="p-2">
        <Icon as={Search} size={22} color={colors.ink.DEFAULT} />
      </Pressable>
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

  // 요약 카드(노션 19번 ①): sky-50 · 둥글기 16 · 안쪽 위·좌우 16 / 아래 12 · 총 지출 줄과 버튼 묶음 사이 14.
  const summary = (
    <View className="px-5 pb-2 pt-1">
      <View className="rounded-box bg-sky-50 px-4 pb-3 pt-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-[13px] text-ink-500">총 지출</Text>
            <Text style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.8 }} className="font-semibold text-[26px] text-ink">
              {formatKrw(room.totalKrw)}
            </Text>
          </View>
          <Pressable
            ref={avatarRef}
            accessibilityRole="button"
            accessibilityLabel={`참여자 ${people.length}명 보기`}
            hitSlop={8}
            onPress={() =>
              avatarRef.current?.measureInWindow((x, y, w, h) => setPeopleAt({ top: y + h + 10, right: rightOf(x, w) }))
            }
          >
            <AvatarStack people={people} size={28} />
          </Pressable>
        </View>
        <View className="mt-3.5 flex-row overflow-hidden rounded-button bg-white">
          <Segment
            label="정산 보기"
            icon={Coins}
            iconColor={colors.primary.text}
            onPress={() => (together ? go('/rooms/[roomId]/settle') : setInviteOpen(true))}
          />
          <View className="w-px bg-line" />
          <Segment
            label="공금 지갑"
            icon={Wallet}
            iconColor={colors.warning.DEFAULT}
            onPress={() => (together ? go('/rooms/[roomId]/pool') : setInviteOpen(true))}
          />
          <View className="w-px bg-line" />
          <Segment
            label="내 통계"
            icon={StatsUpSquare}
            iconColor={colors.success.DEFAULT}
            onPress={() => router.push({ pathname: '/rooms/[roomId]/my-stats', params: { roomId } })}
          />
        </View>
      </View>
      {(offline || needJoinHint || hasDraft || pending.length > 0) && (
        <View className="gap-2 pt-3">
          {offline && (
            <View className="rounded-input border border-warning-line bg-warning-banner px-4 py-3">
              <Text className="text-[13px] text-warning-deep">인터넷 연결이 끊겼어요. 기록은 연결 후 할 수 있어요.</Text>
            </View>
          )}
          {needJoinHint && <Text className="px-1 text-[13px] text-ink-500">모든 동행이 앱에 가입해야 정확히 나눠져요</Text>}
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
    </View>
  );

  // 날짜 탭 줄(고정): 좌우 8, 같은 폭 칸, 선택 밑줄 2.5 칸 전체 폭, 아래 구분선 화면 끝까지.
  const dateTabs = (
    <View
      className="flex-row border-b border-line bg-white px-2"
      onLayout={(e) => {
        lay.current.tabs = e.nativeEvent.layout.height;
      }}
    >
      {days.map((d) => {
        const t = dateTab(d);
        const on = activeTab === d.key;
        return (
          <Pressable
            key={d.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={d.label}
            onPress={() => goTab(d.key)}
            className="flex-1 items-center justify-end pt-2"
          >
            {!!t.top && <Text className="text-[11px] text-ink-300">{t.top}</Text>}
            <Text numberOfLines={1} className={`pb-2 font-semibold text-[15px] ${on ? 'text-ink' : 'text-ink-500'}`}>
              {t.label}
            </Text>
            <View className={`h-[2.5px] self-stretch ${on ? 'bg-local' : ''}`} />
          </Pressable>
        );
      })}
    </View>
  );

  // 보기 전환(노션 19번 ③): 왼쪽 ⇄ 버튼, 오른쪽 카테고리 드롭다운(지출 내역일 때만).
  const toggleRow = (
    <View className="min-h-[28px] flex-row items-center justify-between gap-3 px-5 pb-3 pt-4">
      {hasSchedule ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => switchView(showSchedule ? 'exp' : 'sched')}
          hitSlop={8}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Icon as={DataTransferBoth} size={16} color={colors.ink[500]} />
          <Text className="font-semibold text-sm text-ink-500">{showSchedule ? '지출 내역' : '일정표'}</Text>
        </Pressable>
      ) : (
        <View />
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
          <Text className="font-semibold text-sm text-ink">{category ? categoryLabel(category) : '전체'}</Text>
          <Icon as={catAt ? NavArrowUp : NavArrowDown} size={16} color={colors.ink.DEFAULT} />
        </Pressable>
      )}
    </View>
  );

  // 지출 내역(노션 13번): 날짜마다 흰 묶음 카드, 제목·합계는 카드 위, 행 구분선 없이 4 간격.
  const expenseList =
    visibleSections.length === 0 ? (
      feed.isLoading ? null : (
        <View className="items-center justify-center gap-1.5 px-5 py-14">
          <Text className="text-center font-semibold text-base text-ink">
            {category === null ? '첫 지출을 올려보세요' : '해당 품목의 지출이 없어요'}
          </Text>
          <Text className="text-center text-sm text-ink-400">
            {category === null ? '영수증 사진 한 장이면 돼요' : '아래 버튼으로 지출을 올려보세요'}
          </Text>
        </View>
      )
    ) : (
      <View className="gap-6 px-5">
        {visibleSections.map((section) => {
          const sum = section.data.reduce((s, r) => s + ('kind' in r ? 0 : (r.krwAmount ?? 0)), 0);
          const hasExpense = section.data.some((r) => !('kind' in r));
          return (
            <View
              key={section.key}
              className="gap-2.5"
              onLayout={(e) => onDayLayout(section.key, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-[13px] text-ink-500">{section.title}</Text>
                {hasExpense && (
                  <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[13px] text-ink">
                    {formatKrw(sum)}
                  </Text>
                )}
              </View>
              <View className="gap-1 rounded-box border border-card-line bg-white px-4 py-1">
                {section.data.map((item) => (
                  <Fragment key={item.id}>
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
        })}
      </View>
    );

  const scheduleBody = firstRun ? (
    <ScheduleEmpty
      days={days
        .filter((d) => d.key !== 'all' && d.key !== 'pre-trip')
        .map((d, i) => ({ key: d.key, dayIndex: i + 1, label: d.label, sub: `${d.sub} (${dateTab(d).top})` }))}
      onAddSchedule={(dayIndex) => setDraft(newDraft(dayIndex))}
      onDayLayout={onDayLayout}
    />
  ) : (
    <ScheduleSection
      days={scheduleDays}
      pkg={pkg}
      onMore={(item, pageY) => setMoreAt({ item, top: pageY + 14 })}
      onAddSchedule={(dayIndex) => setDraft(newDraft(dayIndex))}
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
      onDayLayout={onDayLayout}
    />
  );

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      {topBar}
      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[1]}
        scrollEventThrottle={16}
        onLayout={(e) => {
          lay.current.viewport = e.nativeEvent.layout.height;
          fitBottom();
        }}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const next = y > 0;
          setScrolled((v) => (v === next ? v : next));
          // 스크롤 위치에 따라 밑줄을 옮긴다: 탭 아래를 지난 마지막 날짜.
          let on = 'all';
          for (const k of tabKeys) if (lay.current.days.has(k) && dayTop(k) <= y + 2) on = k;
          setActiveTab((v) => (v === on ? v : on));
        }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
      >
        {summary}
        {dateTabs}
        <View
          onLayout={(e) => {
            lay.current.body = e.nativeEvent.layout.y;
          }}
        >
          {toggleRow}
          <View
            key={showSchedule ? 'sched' : 'exp'}
            onLayout={(e) => {
              lay.current.list = e.nativeEvent.layout.y;
            }}
          >
            {showSchedule ? scheduleBody : expenseList}
          </View>
          <View style={{ height: bottomPad }} />
        </View>
      </ScrollView>
      <BottomBar fade>
        <PrimaryButton
          title="지출 올리기"
          icon={Plus}
          onPress={() => router.push({ pathname: '/rooms/[roomId]/expenses/new', params: { roomId } })}
        />
      </BottomBar>
      <ScheduleSheet
        draft={draft}
        days={sheetDays}
        pkg={pkg}
        saving={saveSchedule.isPending}
        onClose={() => setDraft(null)}
        onSave={(d) =>
          saveSchedule.mutate(
            {
              id: d.id,
              roomId,
              dayIndex: d.dayIndex,
              startTime: d.startTime || null,
              title: d.title,
              includes: d.includes,
              optional: d.optional,
              estAmount: d.estAmount,
              position: d.position,
            },
            {
              onSuccess: () => {
                setDraft(null);
                toast(d.id ? '일정을 수정했어요' : '일정을 추가했어요');
              },
            },
          )
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
      {/* 일정 '…' 메뉴(노션 9번). 순서 변경 권한은 참여자 전원(질문 사항의 기본값) */}
      <MenuPopover
        at={moreAt ? { top: moreAt.top, right: 20 } : null}
        width={180}
        items={[
          { key: 'edit', label: '일정 수정', selected: false },
          { key: 'above', label: '위에 일정 추가', selected: false },
          { key: 'below', label: '아래에 일정 추가', selected: false },
          { key: 'delete', label: '일정 삭제', selected: false, danger: true },
        ]}
        onPick={(key) => {
          const it = moreAt?.item;
          setMoreAt(null);
          if (!it) return;
          if (key === 'delete') {
            deleteSchedule.mutate(it.id, { onSuccess: () => toast('일정을 삭제했어요. 연결된 지출은 그 외 지출로 옮겼어요') });
            return;
          }
          const next = key === 'edit' ? draftOf(it) : newDraft(it.dayIndex, it.position + (key === 'below' ? 1 : 0));
          setTimeout(() => setDraft(next), AFTER_POPOVER_MS);
        }}
        onClose={() => setMoreAt(null)}
      />
    </View>
  );
}

type SegmentProps = {
  label: string;
  icon: ComponentType<SvgProps>;
  iconColor: string;
  onPress: () => void;
};

// 요약 카드 버튼 묶음 한 칸: 높이 36 · 13/600 · 아이콘 16 · 아이콘↔글자 5.
function Segment({ label, icon, iconColor, onPress }: SegmentProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-9 flex-1 flex-row items-center justify-center gap-[5px] active:bg-app"
    >
      <Icon as={icon} size={16} color={iconColor} />
      <Text className="font-semibold text-[13px] text-ink">{label}</Text>
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
      <Text className={`flex-1 font-semibold text-base ${warning ? 'text-warning-text' : 'text-primary-text'}`}>{text}</Text>
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

// 아바타 스택 아래에 붙는 참여자 목록 카드(폭 200, 노션 15번). 내보내기는 여행 방 설정 > 참여자에서만.
function PeoplePopover({ at, members, colorIndex, myId, onClose }: PeoplePopoverProps) {
  return (
    <Modal visible={!!at} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1">
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="닫기" onPress={onClose} />
        {at && (
          <View
            className="rounded-box bg-white px-4 pb-2 pt-3"
            style={{
              position: 'absolute',
              top: at.top,
              right: at.right,
              width: 200,
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
                  <Text className="min-w-0 flex-1 text-[15px] text-ink" numberOfLines={1}>
                    {m.name}
                  </Text>
                  {(m.userId === myId || m.kind === 'guest') && (
                    <Text className="shrink-0 text-[13px] text-ink-300" numberOfLines={1}>
                      {m.userId === myId ? '나' : '게스트'}
                    </Text>
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
