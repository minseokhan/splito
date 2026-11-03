import { router, useLocalSearchParams } from 'expo-router';
import { Sparks } from 'iconoir-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CATEGORY_ICON } from '@/components/categoryIcon';
import { useToast } from '@/components/Toast';
import { useMyBudget, useMyShares, useSaveBudget } from '@/hooks/useBudget';
import { ALLOC_CATEGORIES, allocByRatio, categoryBreakdown, isBudgetTarget } from '@/lib/budget';
import { categoryLabel, type CategoryCode } from '@/lib/category';
import { supabase } from '@/services/supabase';
import { colors } from '@/theme/tokens';
import type { Krw, TripBudget } from '@/types/domain';

type Alloc = Partial<Record<CategoryCode, Krw>>;

const MODES: { key: TripBudget['allocMode']; label: string }[] = [
  { key: 'manual', label: '직접 입력' },
  { key: 'ai', label: 'AI 추천 받기' },
  { key: 'none', label: '나중에' },
];

const digits = (s: string) => s.replace(/[^0-9]/g, '');
const comma = (n: number) => (n > 0 ? n.toLocaleString('ko-KR') : '');

export default function Budget() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const toast = useToast();
  const { data: current } = useMyBudget(roomId);
  const { data: shares = [] } = useMyShares(roomId);
  const save = useSaveBudget(roomId);

  const editing = !!current && current.totalKrw > 0;
  const [total, setTotal] = useState(current?.totalKrw ?? 0);
  const [mode, setMode] = useState<TripBudget['allocMode']>(current?.allocMode ?? 'manual');
  const [alloc, setAlloc] = useState<Alloc>(current?.alloc ?? {});
  const [aiAlloc, setAiAlloc] = useState<Alloc | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const spentByCategory: Alloc = Object.fromEntries(
    categoryBreakdown(shares.filter((s) => isBudgetTarget(s.category)))
      .filter((r) => ALLOC_CATEGORIES.includes(r.code))
      .map((r) => [r.code, r.amount]),
  );

  const loadAi = async (totalKrw: number) => {
    if (totalKrw <= 0) return;
    setAiLoading(true);
    try {
      // api.ts는 다른 작업자가 소유해 budget-coach 래퍼를 넣지 못했다. Edge Function을 직접 호출한다.
      const { data, error } = await supabase.functions.invoke<{ alloc: Alloc }>('budget-coach', {
        body: { room_id: roomId, kind: 'alloc', total_krw: totalKrw, spent: spentByCategory },
      });
      if (error || !data?.alloc) throw error ?? new Error('EMPTY');
      setAiAlloc(data.alloc);
    } catch {
      // 실패하면 지금까지 지출 비율로 나눈다.
      setAiAlloc(allocByRatio(totalKrw, spentByCategory));
    } finally {
      setAiLoading(false);
    }
  };

  const pickMode = (key: TripBudget['allocMode']) => {
    setMode(key);
    if (key === 'ai' && !aiAlloc) void loadAi(total);
  };

  const manualSum = ALLOC_CATEGORIES.reduce((a, c) => a + (alloc[c] ?? 0), 0);
  const mismatch = mode === 'manual' && manualSum > 0 && manualSum !== total;

  const onSave = () => {
    const next = mode === 'manual' ? alloc : mode === 'ai' ? (aiAlloc ?? {}) : {};
    save.mutate(
      { roomId, totalKrw: total, allocMode: mode, alloc: next },
      {
        onSuccess: () => {
          toast('예산을 저장했어요');
          if (router.canGoBack()) router.back();
          else router.replace(`/rooms/${roomId}/my-stats`);
        },
        onError: () => toast('저장하지 못했어요'),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-[18px] px-5 pb-10 pt-2">
          <View className="gap-1.5">
            <Text className="font-semibold text-2xl text-ink">{editing ? '예산 수정' : '여행 예산을 정해 주세요'}</Text>
            {!editing && <Text className="text-[15px] text-ink-500">하루 쓸 수 있는 금액을 계산해 드려요</Text>}
          </View>

          <View className="gap-2">
            <Text className="font-semibold text-[13px] text-ink-500">전체 예산</Text>
            <View
              style={{ borderWidth: 1.5, borderColor: colors.primary.DEFAULT, boxShadow: '0 0 0 4px rgba(29,60,143,.16)' }}
              className="h-14 flex-row items-center gap-1.5 rounded-input px-4"
            >
              <TextInput
                accessibilityLabel="전체 예산"
                value={comma(total)}
                onChangeText={(t) => setTotal(Number(digits(t) || 0))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.ink[300]}
                style={{ fontSize: 22 }}
                className="h-full min-w-0 flex-1 font-semibold text-ink"
              />
              <Text className="font-semibold text-lg text-ink">원</Text>
            </View>
            <Text className="text-xs text-ink-400">항공·숙박료는 빼고 입력해 주세요</Text>
          </View>

          <View className="gap-2.5">
            <Text className="font-semibold text-[13px] text-ink-500">
              카테고리 배분 <Text className="font-medium text-ink-300">선택</Text>
            </Text>
            <View className="flex-row gap-1.5 rounded-input bg-muted p-1">
              {MODES.map((m) => {
                const on = m.key === mode;
                return (
                  <Pressable
                    key={m.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => pickMode(m.key)}
                    style={on ? { boxShadow: '0 1px 3px rgba(19,25,39,.12)' } : undefined}
                    className={`h-[38px] flex-1 items-center justify-center rounded-[10px] ${on ? 'bg-white' : ''}`}
                  >
                    <Text className={`font-semibold text-sm ${on ? 'text-ink' : 'text-ink-400'}`}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === 'manual' && (
              <View className="gap-2">
                {ALLOC_CATEGORIES.map((code) => (
                  <View key={code} className="flex-row items-center gap-2.5">
                    <Icon as={CATEGORY_ICON[code]} size={18} color={colors.primary.text} />
                    <Text className="flex-1 text-[15px] text-ink">{categoryLabel(code)}</Text>
                    <View style={{ borderWidth: 1.5, borderColor: colors.line.DEFAULT }} className="h-[42px] w-[140px] justify-center rounded-chip px-3">
                      <TextInput
                        accessibilityLabel={`${categoryLabel(code)} 예산`}
                        value={comma(alloc[code] ?? 0)}
                        onChangeText={(t) => setAlloc((a) => ({ ...a, [code]: Number(digits(t) || 0) }))}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.ink[300]}
                        className="text-right font-semibold text-[15px] text-ink"
                      />
                    </View>
                  </View>
                ))}
                {/* 합계가 달라도 막지 않고 안내만 한다(명세 §4). */}
                {mismatch && (
                  <Text className="text-[13px] text-warning">
                    배분 합계 {formatKrw(manualSum)}이 전체 예산과 {formatKrw(Math.abs(manualSum - total))} 달라요
                  </Text>
                )}
              </View>
            )}

            {mode === 'ai' && (
              <View className="gap-2 rounded-button border border-stats-line bg-sky-50 p-3.5">
                <View className="flex-row items-center gap-1.5">
                  <Icon as={Sparks} size={16} color={colors.primary.text} />
                  <Text className="font-semibold text-[13px] text-primary-text">지금까지 지출을 바탕으로 나눴어요</Text>
                </View>
                {aiLoading && <ActivityIndicator color={colors.primary.DEFAULT} />}
                {!aiLoading &&
                  ALLOC_CATEGORIES.map((code) => {
                    const v = aiAlloc?.[code] ?? 0;
                    return (
                      <View key={code} className="flex-row items-center gap-2.5">
                        <Icon as={CATEGORY_ICON[code]} size={16} color={colors.primary.text} />
                        <Text className="flex-1 text-sm text-ink">{categoryLabel(code)}</Text>
                        <Text className="font-semibold text-sm text-ink">{formatKrw(v)}</Text>
                        <Text className="w-9 text-right text-xs text-ink-400">{total > 0 ? Math.round((v / total) * 100) : 0}%</Text>
                      </View>
                    );
                  })}
                {!aiLoading && !aiAlloc && (
                  <PrimaryButton title="추천 받기" variant="sky" size="md" disabled={total <= 0} onPress={() => void loadAi(total)} />
                )}
              </View>
            )}

            {mode === 'none' && (
              <Text className="rounded-chip bg-app px-3.5 py-3 text-sm text-ink-500">
                전체 예산만 저장해요. 카테고리 배분은 나중에 할 수 있어요.
              </Text>
            )}
          </View>

          <PrimaryButton title="저장" variant="dark" disabled={total < 1} loading={save.isPending} onPress={onSave} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
