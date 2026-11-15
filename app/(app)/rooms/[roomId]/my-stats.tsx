import { router, useLocalSearchParams } from 'expo-router';
import { Download, Page } from 'iconoir-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { BudgetCard } from '@/components/BudgetCard';
import { CoachCard, CoachSheet } from '@/components/CoachSheet';
import { Icon } from '@/components/Icon';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { BudgetExplainerSheet, PassLockBar, PassLockCard, PassSheet } from '@/components/PassSheets';
import { CategoryCard, CompareCard, MatesCard, type MateRow } from '@/components/StatsCharts';
import { useToast } from '@/components/Toast';
import { api } from '@/services/api';
import { exportExpenses, type ExportFormat } from '@/services/exportExpenses';
import { useApplyBudgetPlan, useMyBudget, useMyShares } from '@/hooks/useBudget';
import { useAuth } from '@/hooks/useAuth';
import { useMyRooms, useRoom, useRoomMembers, useRoomPass } from '@/hooks/useRooms';
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
import { hiddenCount, maskWon, type PassReason } from '@/lib/pass';
import { colors, memberColor } from '@/theme/tokens';
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
  const myId = useAuth().session?.user.id;
  const { data: roomRow } = useRoom(roomId);
  const owner = roomRow?.owner_id === myId;
  // 여행 패스 없음(무료)이면 일부 금액을 가린다. 불러오는 동안은 잠그지 않는다(잠금 화면이 깜빡이지 않게).
  const { data: passRec, isSuccess: passLoaded } = useRoomPass(roomId);
  const locked = passLoaded && !passRec;
  const [pass, setPass] = useState<{ reason: PassReason | null } | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const openPass = () => (owner ? setPass({ reason: 'stats' }) : toast('방장에게 결제 요청을 보냈어요'));

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
        masked: locked && m.userId !== myId,
      };
    });
  }, [members, balances, locked, myId]);

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

      <ScrollView contentContainerClassName={`gap-3 px-4 pt-1 ${locked ? 'pb-[120px]' : 'pb-12'}`}>
        {locked ? (
          <PassLockCard owner={owner} onStart={openPass} onExplain={() => setExplainOpen(true)} />
        ) : (
          <>
            <BudgetCard stats={stats} cheer={cheer} onSetBudget={goBudget} />
            {coach && <CoachCard card={coach} onPress={openCoach} />}
          </>
        )}
        <CompareCard
          locked={locked}
          top={locked ? maskWon(compare.top).text : compare.top}
          bottom={compare.bottom}
          daily={daily}
          baseline={dailyBaseline(stats.budget, stats.N)}
          d={stats.d}
          selected={selectedIndex}
        />
        <CategoryCard rows={catRows} onPick={setCatSheet} locked={locked} onLocked={openPass} />
        {mates.length > 0 && <MatesCard rows={mates} onLocked={openPass} />}
        <ExportCard roomId={roomId} empty={!shares.length && !room?.totalKrw} />
      </ScrollView>

      {locked && (
        <PassLockBar
          owner={owner}
          onPress={openPass}
          count={hiddenCount({
            compareTop: compare.top,
            baseline: dailyBaseline(stats.budget, stats.N) > 0,
            categories: catRows.length,
            others: mates.filter((m) => m.masked).length,
          })}
        />
      )}
      <BudgetExplainerSheet
        visible={explainOpen}
        owner={owner}
        onClose={() => setExplainOpen(false)}
        onStart={() => {
          setExplainOpen(false);
          openPass();
        }}
      />
      <PassSheet
        visible={!!pass}
        reason={pass?.reason}
        owner={owner}
        memberCount={members.filter((m) => !m.leftAt).length}
        onClose={() => setPass(null)}
        onPay={() => {
          setPass(null);
          toast('결제는 곧 열려요');
        }}
        onRequest={() => {
          setPass(null);
          toast('방장에게 결제 요청을 보냈어요');
        }}
      />

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

const EXPORTS: { format: ExportFormat; label: string; done: string; color: string }[] = [
  { format: 'xlsx', label: 'Excel로 내보내기', done: 'Excel 파일을 만들었어요', color: colors.success.DEFAULT },
  { format: 'pdf', label: 'PDF로 내보내기', done: 'PDF 파일을 만들었어요', color: colors.danger.DEFAULT },
];

// 지출 내역 내보내기(명세 export). 파일은 서버가 만들고, 받은 뒤 OS 공유 시트를 연다.
function ExportCard({ roomId, empty }: { roomId: string; empty: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const run = async (e: (typeof EXPORTS)[number]) => {
    setBusy(e.format);
    try {
      const url = await exportExpenses(roomId, e.format);
      toast(e.done);
      await Share.share({ url });
    } catch {
      toast('파일을 만들지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <View className="gap-2.5 pt-3">
      <Text className="px-1 font-semibold text-[13px] text-ink-500">지출 내역 내보내기</Text>
      <View style={{ boxShadow: '0 2px 8px -2px rgba(19,25,39,.06)' }} className="rounded-card bg-white px-5">
        {EXPORTS.map((e, i) => (
          <Pressable
            key={e.format}
            accessibilityRole="button"
            accessibilityState={{ disabled: empty || !!busy, busy: busy === e.format }}
            disabled={empty || !!busy}
            onPress={() => run(e)}
            className={`flex-row items-center gap-3 py-[18px] ${i > 0 ? 'border-t border-line-row' : ''}`}
          >
            <Icon as={Page} size={22} color={empty ? colors.ink[300] : e.color} />
            <Text className={`flex-1 font-semibold text-base ${empty ? 'text-ink-300' : 'text-ink'}`}>{e.label}</Text>
            {busy === e.format ? <ActivityIndicator color={colors.ink[400]} /> : <Icon as={Download} size={18} color={colors.ink[300]} />}
          </Pressable>
        ))}
      </View>
      {empty && <Text className="px-1 text-[13px] text-ink-400">아직 올린 지출이 없어요</Text>}
    </View>
  );
}
