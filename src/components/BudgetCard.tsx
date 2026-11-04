import { Calendar, CheckCircle, Coins, EditPencil, Sparks } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';

import type { BudgetStats, Cheer } from '@/lib/budget';
import { colors } from '@/theme/tokens';

import { Icon } from './Icon';
import { formatKrw } from './Money';
import { PrimaryButton } from './PrimaryButton';

// 예산 현황 카드(my-stats-spec §3). 카드는 흰색 radius 20, 그림자는 시안 실측.
const CARD = { boxShadow: '0 2px 8px -2px rgba(19,25,39,.06)' };

type Props = { stats: BudgetStats; cheer: Cheer | null; onSetBudget: () => void };

function Card({ children, gap = 14 }: { children: React.ReactNode; gap?: number }) {
  return (
    <View style={[CARD, { gap }]} className="rounded-card bg-white p-5">
      {children}
    </View>
  );
}

const Header = ({ onEdit }: { onEdit?: () => void }) => (
  <View className="flex-row items-center justify-between">
    <Text className="font-semibold text-sm text-ink-500">예산 현황</Text>
    {onEdit && (
      <Pressable accessibilityRole="button" accessibilityLabel="예산 수정" onPress={onEdit} hitSlop={8} className="p-0.5">
        <Icon as={EditPencil} size={17} color={colors.ink[400]} />
      </Pressable>
    )}
  </View>
);

export function BudgetCard({ stats, cheer, onSetBudget }: Props) {
  if (stats.state === 'NONE') {
    return (
      <Card>
        <Header />
        <View className="gap-1">
          <Text className="font-semibold text-lg text-ink">아직 예산이 없어요</Text>
          <Text className="text-sm text-ink-500">예산을 정하면 오늘 쓸 수 있는 금액을 알려드려요</Text>
        </View>
        <PrimaryButton title="예산 설정하기" variant="dark" size="md" onPress={onSetBudget} />
      </Card>
    );
  }

  // OVER는 초과 금액과 빨간 바, 연필만 보여준다(명세 §3-2).
  if (stats.state === 'OVER') {
    return (
      <Card gap={12}>
        <Header onEdit={onSetBudget} />
        <Text className="font-semibold text-[28px] leading-[1.3] text-danger">예산 초과 +{formatKrw(stats.over)}</Text>
        <View className="h-2.5 rounded-full bg-danger" />
      </Card>
    );
  }

  const fast = stats.state === 'FAST';
  const barColor = fast ? colors.warning.bar : colors.primary.DEFAULT;
  const pct = Math.round(stats.pct * 100);
  const todayPct = stats.rec > 0 ? Math.min(100, Math.round((stats.todaySpent / stats.rec) * 100)) : 0;

  return (
    <Card>
      <Header />
      <View>
        <Text className="text-[13px] text-ink-400">여행 중 쓴 금액</Text>
        <Text className="font-semibold text-[28px] leading-[1.3] text-ink">{formatKrw(stats.spent)}</Text>
      </View>

      <View className="gap-2 pt-1">
        <View className="h-2.5 rounded-full bg-[#EEF0F3]">
          <View style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }} className="h-full rounded-full" />
          {/* 계획 위치는 검정 점선 세로 마커만. 라벨은 붙이지 않는다(명세 §3-3). */}
          <View
            pointerEvents="none"
            style={{ left: `${Math.round(stats.plan * 100)}%`, borderLeftWidth: 2, borderColor: colors.ink.DEFAULT, borderStyle: 'dashed' }}
            className="absolute -bottom-1 -top-1"
          />
        </View>
        <View className="flex-row items-center gap-1.5">
          <View style={{ backgroundColor: barColor }} className="h-2.5 w-2.5 rounded-[3px]" />
          <Text className="text-xs text-ink-500">지출 금액 {pct}%</Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-ink-500">
            예산 <Text className="font-semibold text-ink">{formatKrw(stats.budget)}</Text>
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="예산 수정" onPress={onSetBudget} hitSlop={8} className="p-0.5">
            <Icon as={EditPencil} size={17} color={colors.ink[400]} />
          </Pressable>
        </View>
        <Text numberOfLines={1} className="text-sm text-ink-500">
          남은 금액 <Text className="font-semibold text-ink">{formatKrw(stats.remain)}</Text>
        </Text>
      </View>

      {/* 여행이 끝났으면 오늘 금액 박스를 숨긴다(명세 §11). */}
      {!stats.afterTrip && !stats.beforeTrip && (
        <>
          <View className="h-px bg-[#F0F3F7]" />
          <View className="gap-3 rounded-button bg-stats-box px-4 py-3.5">
            <View className="flex-row items-stretch gap-3.5">
              <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-1">
                  <Icon as={Coins} size={14} color={colors.warning.accent} />
                  <Text className="font-semibold text-xs text-ink-400">오늘 남은 금액</Text>
                </View>
                <Text className="font-semibold text-[22px] leading-[1.3] text-warning-accent">{formatKrw(stats.todayLeft)}</Text>
              </View>
              <View className="w-px bg-line" />
              <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-1">
                  <Icon as={Calendar} size={14} color={colors.ink[400]} />
                  <Text className="font-semibold text-xs text-ink-400">하루 권장액</Text>
                </View>
                <Text className="mt-[3px] font-semibold text-[17px] leading-[1.3] text-ink-500">{formatKrw(stats.rec)}</Text>
              </View>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-[#E9ECF2]">
              <View style={{ width: `${todayPct}%` }} className="h-full rounded-full bg-warning-bar" />
            </View>
          </View>
        </>
      )}

      {cheer && (
        <View className={`flex-row items-start gap-2 rounded-chip px-3 py-2.5 ${fast ? 'bg-warning-banner' : 'bg-success-bg'}`}>
          <Icon as={fast ? Sparks : CheckCircle} size={18} color={fast ? colors.warning.accent : colors.success.DEFAULT} />
          <View className="flex-1">
            <Text className="font-semibold text-[13px] text-ink-700">{cheer.title}</Text>
            <Text className="text-[13px] text-ink-700">{cheer.body}</Text>
          </View>
        </View>
      )}
    </Card>
  );
}
