import { NavArrowRight, RefreshDouble, Sparks } from 'iconoir-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ALLOC_CATEGORIES, type CoachCard as CoachCardView } from '@/lib/budget';
import { categoryLabel } from '@/lib/category';
import { colors } from '@/theme/tokens';
import type { BudgetPlan, Krw } from '@/types/domain';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { formatKrw } from './Money';
import { PrimaryButton } from './PrimaryButton';

/** AI 예산 코칭 카드(명세 §5). 문구는 src/lib/budget.ts coachCard가 정한다. */
export function CoachCard({ card, onPress }: { card: CoachCardView; onPress: () => void }) {
  const Box = card.hasPlans ? Pressable : View;
  return (
    <Box
      accessibilityRole={card.hasPlans ? 'button' : undefined}
      onPress={card.hasPlans ? onPress : undefined}
      className="gap-2 rounded-card border border-stats-line bg-sky-50 px-[18px] py-4"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Sparks} size={18} color={colors.primary.text} />
          <Text className="font-semibold text-sm text-primary-text">AI 예산 코칭</Text>
        </View>
        {card.hasPlans && (
          <View className="flex-row items-center">
            <Text className="font-semibold text-[13px] text-primary-text">조정안 보기</Text>
            <Icon as={NavArrowRight} size={16} color={colors.primary.text} />
          </View>
        )}
      </View>
      <Text className={`font-semibold text-base ${card.danger ? 'text-danger' : 'text-ink'}`}>{card.title}</Text>
      {!!card.sub && <Text className="text-sm text-ink-700">{card.sub}</Text>}
    </Box>
  );
}

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  n: number;
  per: Krw;
  plans: BudgetPlan[];
  loading: boolean;
  onRefresh: () => void;
  onApply: (plan: BudgetPlan) => void;
  appliedId: string | null;
};

/** 조정안 시트(명세 §5). 하루 금액 합계는 서버(budget-coach)가 per에 맞춰 준다. */
export function CoachSheet({ visible, onClose, n, per, plans, loading, onRefresh, onApply, appliedId }: SheetProps) {
  // 고른 적이 없으면 이미 적용한 안, 그것도 없으면 첫 안을 고른 것으로 본다.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selected = plans.find((p) => p.id === (pickedId ?? appliedId)) ?? plans[0];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="gap-4">
        <View className="gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Icon as={Sparks} size={16} color={colors.primary.text} />
            <Text className="font-semibold text-[13px] text-primary-text">AI 예산 코칭</Text>
          </View>
          <Text className="font-semibold text-xl text-ink">남은 {n}일 조정안</Text>
          <Text className="text-sm text-ink-500">하루 {formatKrw(per)}이면 예산 안이에요. 하나를 골라주세요.</Text>
        </View>

        {loading && plans.length === 0 ? (
          <View className="py-10">
            <ActivityIndicator color={colors.primary.DEFAULT} />
          </View>
        ) : (
          plans.map((plan) => {
            const on = plan.id === selected?.id;
            return (
              <Pressable
                key={plan.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setPickedId(plan.id)}
                style={{ borderWidth: 1.5, borderColor: on ? colors.primary.DEFAULT : colors.line.DEFAULT }}
                className={`gap-2.5 rounded-[18px] px-4 py-3.5 ${on ? 'bg-sky-50' : 'bg-white'}`}
              >
                <View className="flex-row items-center gap-2.5">
                  <View
                    style={{ borderWidth: 2, borderColor: on ? colors.primary.DEFAULT : colors.line.off }}
                    className="h-5 w-5 items-center justify-center rounded-full"
                  >
                    {on && <View className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-base text-ink">{plan.title}</Text>
                    {!!plan.desc && <Text className="text-[13px] text-ink-400">{plan.desc}</Text>}
                  </View>
                </View>
                <View className="flex-row gap-1">
                  {ALLOC_CATEGORIES.map((code) => (
                    <View key={code} className={`flex-1 items-center rounded-[10px] py-1.5 ${on ? 'bg-sky-100' : 'bg-muted'}`}>
                      <Text className="text-[11px] text-ink-400">{categoryLabel(code)}</Text>
                      <Text className={`font-semibold text-[13px] ${on ? 'text-primary-text' : 'text-ink'}`}>
                        {formatKrw(plan.perDay[code] ?? 0)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })
        )}

        <Text className="text-xs text-ink-400">금액은 카테고리별 하루 금액이에요</Text>
        <View className="flex-row gap-2">
          <PrimaryButton title="다시 분석" variant="muted" icon={RefreshDouble} loading={loading} onPress={onRefresh} />
          <PrimaryButton title="이 안으로 적용" variant="dark" grow disabled={!selected} onPress={() => selected && onApply(selected)} />
        </View>
      </View>
    </BottomSheet>
  );
}
