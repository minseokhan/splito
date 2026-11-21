import { router } from 'expo-router';
import { NavArrowRight, Plus } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { CategoryCircle } from '@/components/CategoryCircle';
import { FlightIcon } from '@/components/FlightIcon';
import { Icon } from '@/components/Icon';
import { InvitePasteBox } from '@/components/InvitePasteBox';
import { Wordmark } from '@/components/Logo';
import { formatKrw } from '@/components/Money';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { roomPeriod } from '@/components/RoomCard';
import { STATUS_LABEL } from '@/components/StatusChip';
import { useRecentExpenses } from '@/hooks/useRecentExpenses';
import { useMyRooms } from '@/hooks/useRooms';
import { kstToday } from '@/lib/expenseForm';
import { currencyFlag } from '@/lib/flag';
import { formatForeign } from '@/lib/money';
import { isActiveTrip } from '@/lib/roomList';
import { colors } from '@/theme/tokens';
import type { MyRoom } from '@/types/domain';

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

function Header() {
  return (
    <View className="flex-row items-center justify-between">
      <Wordmark size={28} />
      <View className="flex-row items-center gap-1.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="새 여행 만들기"
          onPress={goCreate}
          style={{ marginRight: 4 }}
          className="h-[38px] w-[38px] items-center justify-center rounded-chip border border-line bg-white active:bg-app"
        >
          <PlusGlyph />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="내 정보" onPress={() => router.push('/settings')} className="p-1.5">
          <MeGlyph />
        </Pressable>
      </View>
    </View>
  );
}

const tripMeta = (r: MyRoom) => [roomPeriod(r), `${r.memberCount}명`].filter(Boolean).join(' · ');

// 히어로: 대표 진행 중 방. 원본 is.home — min-h 176, sky-50→sky-100 세로 그라데이션 + 24px 흰 격자(30%).
// TODO(token): 원본 radius 24 → 토큰 없음, 기존 홈 카드의 hero(28) 유지. 우하단 로고 워터마크(#80CCFF 35%)는 새 심볼 에셋이 없어 생략.
function Hero({ room }: { room: MyRoom }) {
  // Svg 퍼센트 크기는 기본 300×150 기준으로 잡혀 카드를 다 못 덮는다 — 카드 실측 크기를 숫자로 넘긴다.
  const [box, setBox] = useState({ w: 0, h: 0 });
  return (
    <View
      className="min-h-[176px] overflow-hidden rounded-hero p-5"
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={box.w} height={box.h}>
        <Defs>
          <LinearGradient id="heroBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.sky[50]} />
            <Stop offset="1" stopColor={colors.sky[100]} />
          </LinearGradient>
          <Pattern id="heroGrid" width={24} height={24} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0.5} x2={24} y2={0.5} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
            <Line x1={0.5} y1={0} x2={0.5} y2={24} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width={box.w} height={box.h} fill="url(#heroBg)" />
        <Rect width={box.w} height={box.h} fill="url(#heroGrid)" />
      </Svg>
      </View>
      <View className="max-w-[65%] items-start">
        <Text className="text-13 text-ink-500">{tripMeta(room)}</Text>
        <Text style={{ lineHeight: 31 }} className="mt-1 font-semibold text-22 text-ink" numberOfLines={2}>
          {room.name}
        </Text>
        {room.mySpent > 0 && (
          <Text style={{ fontVariant: ['tabular-nums'] }} className="mt-1 font-semibold text-xl text-ink">
            내 지출 {formatKrw(room.mySpent)}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${room.name} 여행 보기`}
          onPress={() => goRoom(room.roomId)}
          className="mt-4 h-11 flex-row items-center gap-2 rounded-full bg-ink pl-5 pr-4 active:scale-[0.98]"
        >
          <Text className="font-semibold text-15 text-white">여행 보기</Text>
          <Icon as={NavArrowRight} size={16} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

// 여행 목록 한 줄: 60h, radius 16, 흰 배경 + muted 테두리, 누르면 scale .99.
function TripRow({ room }: { room: MyRoom }) {
  const flag = currencyFlag(room.baseCurrency);
  // 오른쪽 값: 보낼 돈 ink / 받을 돈 mint-600 / 없으면 상태 글자.
  const right =
    room.myNet < 0
      ? { text: formatKrw(-room.myNet), cls: 'font-semibold text-ink' }
      : room.myNet > 0
        ? { text: formatKrw(room.myNet), cls: 'font-semibold text-mint-600' }
        : { text: STATUS_LABEL[room.status], cls: 'text-ink-300' };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={room.name}
      onPress={() => goRoom(room.roomId)}
      className="h-[60px] flex-row items-center gap-2.5 rounded-box border border-muted bg-white px-3 active:scale-[0.99]"
    >
      <View className="h-9 w-9 items-center justify-center rounded-toggle bg-app">
        {flag ? <Text className="text-xl">{flag}</Text> : <FlightIcon size={20} />}
      </View>
      <View className="flex-1 gap-0.5">
        <Text style={{ lineHeight: 20 }} className="font-semibold text-15 text-ink" numberOfLines={1}>
          {room.name}
        </Text>
        <Text style={{ lineHeight: 16 }} className="text-xs text-ink-300">
          {tripMeta(room)}
        </Text>
      </View>
      <Text style={{ fontVariant: ['tabular-nums'] }} className={`text-sm ${right.cls}`}>
        {right.text}
      </Text>
      <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
    </Pressable>
  );
}

export default function Home() {
  const { data: rooms, isLoading, error, refetch, isRefetching } = useMyRooms();
  const [showPast, setShowPast] = useState(false);
  const active = (rooms ?? []).filter((r) => r.status !== 'settled');
  // 진행 중 = isActiveTrip 하나뿐(review의 '정산할 곳'과 같은 집합).
  const today = kstToday(new Date());
  const live = (rooms ?? []).filter((r) => isActiveTrip(r, today));
  // 지난 여행은 여집합이다. 그래야 어느 쪽에도 안 드는 방이 생기지 않는다.
  const past = (rooms ?? []).filter((r) => !live.includes(r));
  const featured = live.find((r) => r.status === 'settling') ?? live[0];
  const recent = useRecentExpenses(active);
  const trips = showPast ? [...live, ...past] : live;

  const refresh = () => Promise.all([refetch(), recent.refetch()]);
  if (rooms?.length === 0) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-white">
        <ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 40, gap: 28 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <Header />
          <Text className="font-semibold text-2xl text-ink">
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
        contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 40, gap: 28 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} />}
      >
        <Header />
        {error && <Text className="text-base text-danger">{error.message}</Text>}
        {!isLoading && !error && (
          <>
            <View style={{ marginTop: -12 }}>
              {featured && <Hero room={featured} />}
              <View className={`${featured ? 'mt-6' : ''} flex-row items-center justify-between`}>
                <Text className="font-semibold text-15 text-ink">{showPast ? '모든 여행' : '진행 중인 여행'}</Text>
                {past.length > 0 && (
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPast }} onPress={() => setShowPast((v) => !v)} hitSlop={8}>
                    <Text className="font-semibold text-sm text-primary-text">{showPast ? '접기' : `지난 여행 ${past.length}`}</Text>
                  </Pressable>
                )}
              </View>
              <View className="mt-2.5 gap-2">
                {trips.map((r) => (
                  <TripRow key={r.roomId} room={r} />
                ))}
                {trips.length === 0 && <Text className="py-3 text-sm text-ink-300">진행 중인 여행이 없어요</Text>}
              </View>
            </View>

            {recent.data.length > 0 && (
              <View>
                <View className="mb-1.5 flex-row items-center justify-between">
                  <Text className="font-semibold text-15 text-ink">최근 기록</Text>
                  {active[0] && (
                    <Pressable accessibilityRole="button" onPress={() => goRoom(active[0].roomId)} hitSlop={8}>
                      <Text className="font-semibold text-sm text-primary-text">전체 보기</Text>
                    </Pressable>
                  )}
                </View>
                {recent.data.map((e, i) => (
                  <View key={e.id}>
                    {i > 0 && <View className="h-px bg-muted" />}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => goRoom(e.roomId)}
                      className="-mx-2 flex-row items-center gap-2.5 rounded-button px-2 py-3 active:bg-muted"
                    >
                      <CategoryCircle code={e.category} size={40} />
                      <View className="flex-1 gap-[3px]">
                        <Text className="font-semibold text-base text-ink" numberOfLines={1}>
                          {e.merchant ?? '지출'}
                        </Text>
                        <Text className="text-13 text-ink-400" numberOfLines={1}>
                          {e.payerName} 결제 · {e.roomName}
                        </Text>
                      </View>
                      {/* 금액 표시 규칙(17번): 외화는 현지 통화 크게 + 원화 작게, 원화 결제는 원화만. */}
                      {e.currency === 'KRW' ? (
                        <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-base text-ink">
                          {e.krwAmount !== null ? formatKrw(e.krwAmount) : formatForeign(e.amountOriginal, e.currency)}
                        </Text>
                      ) : (
                        <View className="items-end gap-0.5">
                          <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-base text-local">
                            {formatForeign(e.amountOriginal, e.currency)}
                          </Text>
                          {e.krwAmount !== null && (
                            <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs text-ink-300">
                              {formatKrw(e.krwAmount)}
                            </Text>
                          )}
                        </View>
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
