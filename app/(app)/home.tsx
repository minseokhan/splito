import { router } from 'expo-router';
import { Airplane, CheckCircle, NavArrowRight, Plus } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { CategoryCircle } from '@/components/CategoryCircle';
import { Icon } from '@/components/Icon';
import { InvitePasteBox } from '@/components/InvitePasteBox';
import { BrandWordmark } from '@/components/Logo';
import { formatKrw } from '@/components/Money';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { roomPeriod } from '@/components/RoomCard';
import { useAuth } from '@/hooks/useAuth';
import { useRecentExpenses } from '@/hooks/useRecentExpenses';
import { useMyRooms } from '@/hooks/useRooms';
import { kstToday } from '@/lib/expenseForm';
import { currencyFlag } from '@/lib/flag';
import { formatForeign } from '@/lib/money';
import { dDay, homeTrips, tripPhase } from '@/lib/roomList';
import { colors } from '@/theme/tokens';
import type { MyRoom } from '@/types/domain';

// 노션 29번 홈 리디자인(2026-11-23 시안): 카드·구분선 대신 여백과 글자 크기로 위계를 만든다. 좌우 여백 24.
const PAD = 24;
const CARD_W = 296; // 카드가 2장 이상일 때 폭. 1장이면 콘텐츠 폭을 꽉 채운다.
const CARD_GAP = 12;
const TAB = { fontVariant: ['tabular-nums' as const] };

const goRoom = (roomId: string) => router.push({ pathname: '/rooms/[roomId]', params: { roomId } });
const goCreate = () => router.push('/rooms/start');

// 홈 우상단 두 아이콘만 커스텀 SVG(둥근 굵은 선, 속 비움). 다른 화면에서는 쓰지 않는다.
const PlusGlyph = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.primary.text} strokeWidth={2.2} strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

const MeGlyph = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colors.ink[700]} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
    <Circle cx={12} cy={8} r={4} />
    <Path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6z" />
  </Svg>
);

// 상단: 워드마크 34(노션 30번) / 오른쪽 + · 프로필, 터치 44×44.
function Header() {
  return (
    <View className="flex-row items-center justify-between">
      <BrandWordmark height={34} />
      <View className="flex-row items-center gap-1.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="새 여행 만들기"
          onPress={goCreate}
          className="h-11 w-11 items-center justify-center rounded-input border border-line bg-white active:bg-app"
        >
          <PlusGlyph />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="내 정보" onPress={() => router.push('/settings')} className="h-11 w-11 items-center justify-center">
          <MeGlyph />
        </Pressable>
      </View>
    </View>
  );
}

// 진행 중은 스카이, 예정·지난 여행은 민트. 장식 도형 3개(큰 사각 · 작은 사각 2개)는 색만 다르다.
const TONE = {
  sky: { bg: colors.sky[50], s1: colors.sky[100], s2: '#9DEBD5', s3: '#80CCFF' }, // TODO(token): 민트 200·스카이 300 토큰 없음
  mint: { bg: colors.mint[50], s1: colors.mint[100], s2: colors.sky[200], s3: '#66DDBD' }, // TODO(token): 민트 300
};

function badgeOf(room: MyRoom, today: string) {
  const phase = tripPhase(room, today);
  if (phase === 'live') return { label: '진행 중', box: 'bg-primary-text', text: 'text-white' };
  if (phase === 'upcoming' && room.startDate) return { label: dDay(room.startDate, today), box: 'bg-white', text: 'text-primary-text' };
  return { label: '정산 남음', box: 'bg-warning-bg', text: 'text-warning-text' };
}

const cardMeta = (r: MyRoom) => [roomPeriod(r), r.memberCount > 1 ? `${r.memberCount}명과 함께` : null].filter(Boolean).join(' · ');

// 여행 카드: radius 28 · 여백 20 · 최소 높이 208, 테두리·그림자 없음. 위는 여행, 아래 흰 박스는 내 지출 금액. 둘 다 누르면 여행 장부.
function TripCard({ room, today, width }: { room: MyRoom; today: string; width: number }) {
  const tone = tripPhase(room, today) === 'live' ? TONE.sky : TONE.mint;
  const badge = badgeOf(room, today);
  const flag = currencyFlag(room.baseCurrency);
  return (
    <View style={{ width, backgroundColor: tone.bg }} className="min-h-[208px] justify-between gap-5 overflow-hidden rounded-hero p-5">
      <View pointerEvents="none" style={{ position: 'absolute', top: -18, right: -14, width: 84, height: 84, borderRadius: 22, backgroundColor: tone.s1, transform: [{ rotate: '14deg' }] }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 30, right: 58, width: 14, height: 14, borderRadius: 4, backgroundColor: tone.s2, transform: [{ rotate: '18deg' }] }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 72, right: 22, width: 9, height: 9, borderRadius: 3, backgroundColor: tone.s3 }} />

      <Pressable accessibilityRole="button" accessibilityLabel={`${room.name} 장부 보기`} onPress={() => goRoom(room.roomId)} className="gap-3.5 pr-10">
        <View className={`h-[22px] justify-center self-start rounded-full px-[9px] ${badge.box}`}>
          <Text className={`font-semibold text-11 ${badge.text}`}>{badge.label}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          {/* 시안 44·국기 22에서 사용자 요청으로 52·28로 키움(2026-11-25). */}
          <View className="h-[52px] w-[52px] items-center justify-center rounded-box bg-white" style={{ boxShadow: '0 1px 3px rgba(23,32,58,.06)' }}>
            {flag ? <Text style={{ fontSize: 28, lineHeight: 34 }}>{flag}</Text> : <Icon as={Airplane} size={26} color={colors.primary.text} />}
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className="font-semibold text-lg text-ink">
              {room.name}
            </Text>
            <Text className="text-13 text-ink-500">{cardMeta(room)}</Text>
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`내 지출 금액 ${formatKrw(room.mySpent)}`}
        onPress={() => goRoom(room.roomId)}
        className="min-h-[54px] flex-row items-center gap-2 rounded-[18px] bg-white px-4 py-3 active:bg-app"
      >
        <Text className="flex-1 font-semibold text-sm text-ink-500">내 지출 금액</Text>
        <Text style={[TAB, { letterSpacing: -0.3 }]} className="font-semibold text-xl text-ink">
          {formatKrw(room.mySpent)}
        </Text>
        <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
      </Pressable>
    </View>
  );
}

// 섹션 제목 17/700 + 오른쪽 '전체 보기' 13/600 회색. 제목 아래 6.
function SectionHead({ title, onMore, moreLabel = '전체 보기' }: { title: string; onMore?: () => void; moreLabel?: string }) {
  return (
    <View className="mb-1.5 flex-row items-baseline justify-between">
      <Text style={{ letterSpacing: -0.2 }} className="font-semibold text-17 text-ink">
        {title}
      </Text>
      {onMore && (
        <Pressable accessibilityRole="button" onPress={onMore} hitSlop={8}>
          <Text className="font-semibold text-13 text-ink-500">{moreLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// 목록 한 줄(내 여행·최근 기록 공통): 최소 64 · 위아래 12 · 아이콘 40 원, 첫 줄 위에는 구분선 없음.
function ListRow({ first, onPress, label, children }: { first: boolean; onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-[64px] flex-row items-center gap-3 bg-white py-3 active:bg-app ${first ? '' : 'border-t border-line-row'}`}
    >
      {children}
    </Pressable>
  );
}

function TripRow({ room, today, first }: { room: MyRoom; today: string; first: boolean }) {
  const phase = tripPhase(room, today);
  const done = phase === 'done';
  const right =
    phase === 'upcoming' && room.startDate
      ? { text: dDay(room.startDate, today), cls: 'font-semibold text-primary-text' }
      : done
        ? { text: '정산 완료', cls: 'font-semibold text-mint-600' }
        : phase === 'settle'
          ? { text: '정산 남음', cls: 'font-semibold text-warning-text' }
          : { text: '진행 중', cls: 'font-semibold text-primary-text' };
  return (
    <ListRow first={first} label={room.name} onPress={() => goRoom(room.roomId)}>
      <View className={`h-10 w-10 items-center justify-center rounded-full ${done ? 'bg-app' : 'bg-sky-50'}`}>
        <Icon as={done ? CheckCircle : Airplane} size={20} color={done ? colors.ink[300] : colors.primary.text} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="font-semibold text-15 text-ink">
          {room.name}
        </Text>
        <Text className="text-xs text-ink-300">{[roomPeriod(room), `${room.memberCount}명`].filter(Boolean).join(' · ')}</Text>
      </View>
      <Text className={`text-15 ${right.cls}`}>{right.text}</Text>
      <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
    </ListRow>
  );
}

const Empty = ({ text }: { text: string }) => <Text className="py-6 text-center text-sm text-ink-300">{text}</Text>;

// 로딩 중: 0건으로 확정되기 전에는 빈 상태 문구를 띄우지 않는다.
function Skeleton() {
  return (
    <View className="gap-4">
      <View className="h-[52px] w-48 rounded-input bg-app" />
      <View className="h-[208px] rounded-hero bg-app" />
      <View className="mt-5 h-16 rounded-input bg-app" />
      <View className="h-16 rounded-input bg-app" />
    </View>
  );
}

const LIST_MAX = 3;

export default function Home() {
  const { data: rooms, isLoading, error, refetch, isRefetching } = useMyRooms();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const [allTrips, setAllTrips] = useState(false);
  const today = kstToday(new Date());
  const home = homeTrips(rooms ?? [], today);
  // 최근 기록은 아직 안 끝난 여행에서만(기존 규칙).
  const recent = useRecentExpenses((rooms ?? []).filter((r) => tripPhase(r, today) !== 'done'));
  const trips = allTrips ? home.others : home.others.slice(0, LIST_MAX);
  // 내 여행 '전체 보기' ↔ '접기'. 넘치는 게 없으면 버튼도 없다.
  const tripsMore = home.others.length > LIST_MAX ? { onMore: () => setAllTrips((v) => !v), moreLabel: allTrips ? '접기' : '전체 보기' } : {};
  const refresh = () => Promise.all([refetch(), recent.refetch()]);
  const cardW = home.cards.length > 1 ? CARD_W : width - PAD * 2;

  // 첫 이용자 · 지난 여행만: 기존 '새 여행 만들기' 화면을 쓴다. 지난 여행이 있으면 아래에 목록.
  if (rooms && !home.kind) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-white">
        <ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingHorizontal: PAD, paddingBottom: 140, gap: 28 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <Header />
          <Text className="font-semibold text-2xl text-ink">{rooms.length ? '다음 여행을 준비해 볼까요?' : '첫 여행을 만들어 볼까요?'}</Text>
          {/* 로그인 상태: 저장 후 '/'로 보내면 resolveEntryRoute가 합류 확인으로 보낸다. */}
          <InvitePasteBox onSaved={() => router.replace('/')} />
          {home.others.length > 0 && (
            <View>
              <SectionHead title="지난 여행" {...tripsMore} />
              {trips.map((r, i) => (
                <TripRow key={r.roomId} room={r} today={today} first={i === 0} />
              ))}
            </View>
          )}
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
        contentContainerStyle={{ paddingTop: 10, paddingHorizontal: PAD, paddingBottom: 40, gap: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} />}
      >
        <Header />
        {error && <Text className="text-base text-danger">{error.message}</Text>}
        {isLoading && <Skeleton />}
        {!isLoading && !error && home.title && (
          <>
            <View className="gap-1 pt-1.5">
              <Text className="text-sm text-ink-500">{profile?.nickname ? `${profile.nickname}님, 안녕하세요` : '안녕하세요'}</Text>
              <Text style={{ lineHeight: 31 }} className="font-semibold text-22 text-ink">
                {home.title[0]}
                {'\n'}
                {home.title[1]}
              </Text>
            </View>

            {/* 가로 스크롤, 화면 끝까지. 2장 이상이면 296 폭으로 다음 카드가 살짝 보인다. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardW + CARD_GAP}
              decelerationRate="fast"
              style={{ marginHorizontal: -PAD }}
              contentContainerStyle={{ paddingHorizontal: PAD, paddingTop: 2, paddingBottom: 4, gap: CARD_GAP }}
            >
              {home.cards.map((r) => (
                <TripCard key={r.roomId} room={r} today={today} width={cardW} />
              ))}
            </ScrollView>

            {/* 카드 → 내 여행 36, 내 여행 → 최근 기록 38(여백만, 구분선 없음). gap 16 + 20/22. */}
            <View style={{ marginTop: 20 }}>
              <SectionHead title="내 여행" {...tripsMore} />
              {trips.length === 0 && <Empty text="아직 기록된 여행이 없어요" />}
              {trips.map((r, i) => (
                <TripRow key={r.roomId} room={r} today={today} first={i === 0} />
              ))}
            </View>

            <View style={{ marginTop: 22 }}>
              <SectionHead title="최근 기록" onMore={recent.data[0] ? () => goRoom(recent.data[0].roomId) : undefined} />
              {!recent.isLoading && recent.data.length === 0 && <Empty text="최근 기록이 없어요" />}
              {recent.data.map((e, i) => (
                <ListRow key={e.id} first={i === 0} label={e.merchant ?? '지출'} onPress={() => goRoom(e.roomId)}>
                  <CategoryCircle code={e.category} size={40} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text numberOfLines={1} className="font-semibold text-15 text-ink">
                      {e.merchant ?? '지출'}
                    </Text>
                    <Text numberOfLines={1} className="text-xs text-ink-300">
                      {e.payerName} 결제 · {e.roomName}
                    </Text>
                  </View>
                  {/* 금액 표시 규칙(17번): 외화는 현지 통화 크게 + 원화 작게, 원화 결제는 원화만. */}
                  <View className="items-end gap-0.5">
                    {e.currency === 'KRW' ? (
                      <Text style={TAB} className="font-semibold text-15 text-ink">
                        {e.krwAmount !== null ? formatKrw(e.krwAmount) : formatForeign(e.amountOriginal, e.currency)}
                      </Text>
                    ) : (
                      <>
                        <Text style={TAB} className="font-semibold text-15 text-primary-text">
                          {formatForeign(e.amountOriginal, e.currency)}
                        </Text>
                        {e.krwAmount !== null && (
                          <Text style={TAB} className="text-xs text-ink-300">
                            {formatKrw(e.krwAmount)}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                </ListRow>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
