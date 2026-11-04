import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { BudgetCard } from '@/components/BudgetCard';
import { CoachCard, CoachSheet } from '@/components/CoachSheet';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { CategoryCard, CompareCard, MatesCard, type MateRow } from '@/components/StatsCharts';
import { useToast } from '@/components/Toast';
import { api } from '@/services/api';
import { useApplyBudgetPlan, useMyBudget, useMyShares } from '@/hooks/useBudget';
import { useMyRooms, useRoomMembers } from '@/hooks/useRooms';
import { useBalances } from '@/hooks/useSettlement';
import {
  ALLOC_CATEGORIES,
  budgetStats,
  categoryBreakdown,
  coachCard,
  compareYesterday,
  dailyBaseline,
  dailyTotals,
  filterByDay,
  isBudgetTarget,
  pickCheer,
  tripDayChips,
  type CheerVersion,
} from '@/lib/budget';
import { categoryLabel, type CategoryCode } from '@/lib/category';
import { memberColor } from '@/theme/tokens';
import type { BudgetPlan, Krw, MyShare } from '@/types/domain';

// TODO(확인 필요): 명세 §10은 '오늘'을 여행지 현지 시간으로 나눈다고 했지만 방에 시간대 정보가 없다.
// 기기 로컬 날짜를 쓴다(여행 중에는 보통 현지 시간대로 맞춰져 있다).
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// TODO(확인 필요): 명세 §12-4 응원 문구 A/B. 방마다 고정되게 1~4 중 하나를 고른다.
function cheerVersion(roomId: string): CheerVersion {
  let h = 0;
  for (const ch of roomId) h = (h * 31 + ch.charCodeAt(0)) % 4;
  return ((h % 4) + 1) as CheerVersion;
}

export default function MyStats() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const toast = useToast();
  const today = localToday();

  const { data: rooms } = useMyRooms();
  const room = rooms?.find((r) => r.roomId === roomId);
  const { data: shares = [] } = useMyShares(roomId);
  const { data: budget } = useMyBudget(roomId);
  const { data: members = [] } = useRoomMembers(roomId);
  const { data: balances } = useBalances(roomId);
  const applyPlan = useApplyBudgetPlan(roomId);

  const [day, setDay] = useState('all');
  const [catSheet, setCatSheet] = useState<CategoryCode | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [plans, setPlans] = useState<BudgetPlan[]>([]);
  const [coachLoading, setCoachLoading] = useState(false);

  const startDate = room?.startDate ?? null;
  const endDate = room?.endDate ?? null;

  const stats = useMemo(
    () => budgetStats({ budget: budget?.totalKrw ?? null, shares, startDate: startDate ?? today, endDate, today }),
    [budget, shares, startDate, endDate, today],
  );

  const chips = useMemo(() => (startDate ? tripDayChips(startDate, endDate, today) : []), [startDate, endDate, today]);
  const periodShares = useMemo(() => filterByDay(shares, day), [shares, day]);
  const catRows = useMemo(() => categoryBreakdown(periodShares), [periodShares]);
  const daily = useMemo(() => (startDate ? dailyTotals(shares, startDate, stats.N) : []), [shares, startDate, stats.N]);

  // 기간 칩으로 일차를 고르면 그 일차를 기준으로 비교한다(명세 §6-1).
  const selectedIndex = day === 'all' ? null : chips.findIndex((c) => c.key === day) - 1;
  const compareDay = selectedIndex === null ? stats.d : selectedIndex + 1;
  const compare = compareYesterday(daily, compareDay);

  const coach = coachCard(stats, daily[stats.d - 2] ?? 0, budget?.appliedPlan?.title ?? null);

  const cheer =
    stats.state === 'FAST' || stats.state === 'NORMAL'
      ? pickCheer(stats.state, cheerVersion(roomId), { per: stats.per, tl: stats.todayLeft, remain: stats.remain, n: stats.n })
      : null;

  const mates: MateRow[] = useMemo(() => {
    const live = members.filter((m) => !m.leftAt);
    if (live.length < 2) return [];
    const byId = new Map(balances?.rows.map((r) => [r.memberId, r]) ?? []);
    // TODO(확인 필요): room_balances는 나만 보기 지출도 포함한다. 명세 §6-3의 '공동 지출만'을 정확히 맞추려면 서버 집계가 필요하다.
    return live.map((m, i) => {
      const c = memberColor(i);
      return {
        id: m.id,
        name: m.name,
        initial: m.name.slice(0, 1),
        tint: c.tint,
        fg: c.fg,
        paid: byId.get(m.id)?.paid ?? 0,
        owed: byId.get(m.id)?.owed ?? 0,
      };
    });
  }, [members, balances]);

  const loadPlans = async () => {
    setCoachLoading(true);
    try {
      const spent = Object.fromEntries(
        categoryBreakdown(shares.filter((s) => isBudgetTarget(s.category)))
          .filter((r) => ALLOC_CATEGORIES.includes(r.code))
          .map((r) => [r.code, r.amount]),
      );
      const { plans: next } = await api.budgetCoach<{ plans: BudgetPlan[] }>({
        room_id: roomId,
        kind: 'plans',
        per: stats.per,
        n: stats.n,
        spent,
        // 사용자가 세운 카테고리별 예산이 조정안의 기준이다(0으로 둔 칸은 조정안에서도 0).
        alloc: budget?.alloc ?? {},
      });
      setPlans(next ?? []);
    } catch {
      toast('조정안을 불러오지 못했어요');
    } finally {
      setCoachLoading(false);
    }
  };

  const openCoach = () => {
    setCoachOpen(true);
    if (plans.length === 0) void loadPlans();
  };

  const onApply = (plan: BudgetPlan) => {
    applyPlan.mutate(
      { roomId, plan },
      {
        onSuccess: () => {
          setCoachOpen(false);
          toast(`'${plan.title}' 안을 적용했어요`);
        },
        onError: () => toast('적용하지 못했어요'),
      },
    );
  };

  const goBudget = () => router.push(`/rooms/${roomId}/budget`);

  if (!startDate) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-stats-bg">
        <NavBar title="내 통계" />
        <Text className="px-5 pt-6 text-base text-ink-500">여행 날짜를 먼저 정하면 통계를 보여드려요</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-stats-bg">
      <NavBar title="내 통계" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-[52px] flex-grow-0" contentContainerClassName="gap-1.5 px-5 pb-3 pt-1">
        {chips.map((c) => {
          const on = c.key === day;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: c.disabled }}
              disabled={c.disabled}
              onPress={() => setDay(c.key)}
              style={{ borderWidth: 1.5 }}
              className={`h-9 flex-row items-center gap-1 rounded-full px-3.5 ${
                on ? 'border-ink bg-ink' : c.disabled ? 'border-line bg-transparent' : 'border-line bg-white'
              }`}
            >
              <Text className={`font-semibold text-sm ${on ? 'text-white' : c.disabled ? 'text-ink-300' : 'text-ink'}`}>{c.label}</Text>
              {!!c.sub && (
                <Text className={`font-medium text-xs ${on ? 'text-on-dark-sub' : c.disabled ? 'text-ink-300' : 'text-ink-400'}`}>{c.sub}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerClassName="gap-3 px-4 pb-12 pt-1">
        <BudgetCard stats={stats} cheer={cheer} onSetBudget={goBudget} />
        {coach && <CoachCard card={coach} onPress={openCoach} />}
        <CompareCard
          top={compare.top}
          bottom={compare.bottom}
          daily={daily}
          baseline={dailyBaseline(stats.budget, stats.N)}
          d={stats.d}
          selected={selectedIndex}
        />
        <CategoryCard rows={catRows} onPick={setCatSheet} />
        {mates.length > 0 && <MatesCard rows={mates} />}
      </ScrollView>

      <CategorySheet
        code={catSheet}
        onClose={() => setCatSheet(null)}
        shares={periodShares}
        memberName={(id) => members.find((m) => m.id === id)?.name ?? '탈퇴한 사용자'}
      />

      <CoachSheet
        visible={coachOpen}
        onClose={() => setCoachOpen(false)}
        n={stats.n}
        per={stats.per}
        plans={plans}
        loading={coachLoading}
        onRefresh={loadPlans}
        onApply={onApply}
        appliedId={budget?.appliedPlan?.id ?? null}
      />
    </SafeAreaView>
  );
}

type CatSheetProps = {
  code: CategoryCode | null;
  onClose: () => void;
  shares: MyShare[];
  memberName: (id: string) => string;
};

// 카테고리 행을 탭하면 그 기간의 지출 목록을 보여준다(명세 §6-2). 금액은 내 몫이다.
function CategorySheet({ code, onClose, shares, memberName }: CatSheetProps) {
  const rows = code ? shares.filter((s) => (s.category ?? 'other') === code) : [];
  const sum: Krw = rows.reduce((a, s) => a + s.myShare, 0);
  return (
    <BottomSheet visible={!!code} onClose={onClose}>
      <View className="gap-1.5">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-semibold text-xl text-ink">{code ? categoryLabel(code) : ''}</Text>
          <Text className="text-sm text-ink-500">{formatKrw(sum)}</Text>
        </View>
        <Text className="pb-1 text-[13px] text-ink-400">내 몫 기준</Text>
        {rows.map((s, i) => (
          <View key={s.expenseId} className={`flex-row items-center gap-3 py-3 ${i < rows.length - 1 ? 'border-b border-line-row' : ''}`}>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-semibold text-base text-ink">
                {s.merchant ?? '지출'}
              </Text>
              <Text className="text-[13px] text-ink-400">
                {s.paidLocalDate} · {s.payerKind === 'pool' ? '공금' : memberName(s.payerMemberId ?? '')}
              </Text>
            </View>
            <Text className="font-semibold text-base text-ink">{formatKrw(s.myShare)}</Text>
          </View>
        ))}
        {rows.length === 0 && <Text className="py-4 text-center text-sm text-ink-400">이 기간에는 지출이 없어요</Text>}
      </View>
    </BottomSheet>
  );
}
