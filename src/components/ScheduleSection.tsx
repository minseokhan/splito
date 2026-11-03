import { Check, EditPencil, Minus, Plus } from 'iconoir-react-native';
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatKrw } from '@/components/Money';
import { Icon } from '@/components/Icon';
import type { ScheduleDay, SchedulableExpense } from '@/lib/schedule';
import { colors } from '@/theme/tokens';

// 일정 카드·그 외 지출에 그릴 지출 한 줄. buildScheduleDays가 이 타입 그대로 묶어 돌려준다.
export type ScheduleRow = SchedulableExpense & {
  title: string;
  who: string;
  main: string; // 큰 금액. 외화 결제면 현지 통화로 쓴다
  mainLocal: boolean; // 현지 통화면 파란색(local)
  sub: string | null; // 작은 보조 — 원화 환산 또는 '선결제' 같은 문구
  tags: string[];
};

type Props = {
  days: ScheduleDay<ScheduleRow>[];
  onEdit: (scheduleId: string) => void;
  onAddSchedule: (dayIndex: number) => void;
  onAddExpense: (scheduleId: string) => void;
  onSkip: (scheduleId: string) => void;
  onUnhide: (dayIndex: number) => void;
  onOpenExpense: (expenseId: string) => void;
};

function Tag({ label }: { label: string }) {
  const warn = label === '예산 제외';
  return (
    <View className={`rounded-[6px] px-1.5 ${warn ? 'bg-warning-badge' : 'bg-[#E9EDF2]'}`}>
      <Text className={`font-semibold text-[11px] ${warn ? 'text-warning' : 'text-ink-500'}`}>{label}</Text>
    </View>
  );
}

// 포함은 채운 칩 + 체크, 불포함은 테두리 칩 + 마이너스.
function IncludeChip({ label, on }: { label: string; on: boolean }) {
  return (
    <View
      className={`flex-row items-center gap-[3px] rounded-full px-2 py-px ${on ? 'bg-muted' : 'bg-white'}`}
      style={{ borderWidth: 1, borderColor: on ? colors.muted : colors.line.DEFAULT }}
    >
      <Icon as={on ? Check : Minus} size={12} color={on ? colors.ink[700] : colors.ink[400]} />
      <Text className={`text-xs ${on ? 'text-ink-700' : 'text-ink-400'}`}>{label}</Text>
    </View>
  );
}

function ExpenseLine({ row, onPress }: { row: ScheduleRow; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="flex-row items-baseline justify-between gap-2">
      <Text className="min-w-0 flex-1 text-[13px] text-ink-700" numberOfLines={1}>
        {row.title} <Text className="text-ink-300">{row.who}</Text>
      </Text>
      <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[13px] text-ink">
        {formatKrw(row.krwAmount ?? 0)}
      </Text>
    </Pressable>
  );
}

export function ScheduleSection({
  days,
  onEdit,
  onAddSchedule,
  onAddExpense,
  onSkip,
  onUnhide,
  onOpenExpense,
}: Props) {
  return (
    <View className="gap-3 px-5 pt-1.5">
      {days.map((d) => (
        <View key={d.key} className="gap-2.5">
          <Text className="pt-1.5 font-semibold text-[13px] text-ink-500">{d.header}</Text>

          {d.cards.map((c) => (
            <View key={c.item.id} className="flex-row gap-2.5">
              <View className="w-[38px] shrink-0 items-center gap-1.5 pt-3">
                <Text className="font-semibold text-xs text-ink-500">{c.item.startTime}</Text>
                <View className="w-[1.5px] flex-1 rounded-sm bg-line" />
              </View>
              <View className="min-w-0 flex-1 gap-2 rounded-2xl border border-card-line bg-white px-3.5 py-3">
                <View className="flex-row items-start gap-2">
                  <View className="flex-1 flex-row flex-wrap items-center gap-1.5">
                    <Text className="font-semibold text-[15px] text-ink">{c.item.title}</Text>
                    {c.item.optional && <Tag label="선택관광" />}
                    {c.item.edited && <Tag label="직접 수정" />}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${c.item.title} 일정 수정`}
                    hitSlop={8}
                    onPress={() => onEdit(c.item.id)}
                    className="p-0.5"
                  >
                    <Icon as={EditPencil} size={17} color={colors.ink[300]} />
                  </Pressable>
                </View>

                {(c.item.includes.length > 0 || c.item.excludes.length > 0) && (
                  <View className="flex-row flex-wrap gap-1">
                    {c.item.includes.map((l) => (
                      <IncludeChip key={l} label={l} on />
                    ))}
                    {c.item.excludes.map((l) => (
                      <IncludeChip key={l} label={l} on={false} />
                    ))}
                  </View>
                )}

                {c.showEst && (
                  <View className="flex-row items-center justify-between rounded-[10px] bg-warning-banner px-2.5 py-[7px]">
                    <Text className="font-semibold text-[13px] text-warning">예정 · 약 {formatKrw(c.item.estAmount)}</Text>
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onSkip(c.item.id)}>
                      <Text className="font-semibold text-[13px] text-ink-400">안 해요</Text>
                    </Pressable>
                  </View>
                )}

                {c.expenses.map((e) => (
                  <ExpenseLine key={e.id} row={e} onPress={() => onOpenExpense(e.id)} />
                ))}

                <View className="flex-row items-center justify-between border-t border-muted pt-2">
                  <Text className={`text-xs ${c.expenses.length ? 'font-semibold text-ink' : 'text-ink-300'}`}>
                    {c.expenses.length ? `연결된 지출 ${formatKrw(c.sum)}` : '연결된 지출 없음'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${c.item.title}에 지출 올리기`}
                    onPress={() => onAddExpense(c.item.id)}
                    className="h-[30px] flex-row items-center gap-[3px] rounded-full border-[1.5px] border-line px-2.5"
                  >
                    <Icon as={Plus} size={14} color={colors.primary.text} />
                    <Text className="font-semibold text-[13px] text-primary-text">지출</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}

          {/* '여행 전'에는 일정을 더할 수 없다(명세 §6) */}
          {d.dayIndex > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => onAddSchedule(d.dayIndex)}
              className="ml-12 h-10 flex-row items-center justify-center gap-1 rounded-chip border-[1.5px] border-dashed border-line-off"
            >
              <Icon as={Plus} size={15} color={colors.ink[500]} />
              <Text className="font-semibold text-[13px] text-ink-500">일정 추가</Text>
            </Pressable>
          )}

          {d.hiddenCount > 0 && (
            <Pressable accessibilityRole="button" onPress={() => onUnhide(d.dayIndex)} className="pl-12">
              <Text className="text-xs text-ink-400">
                숨긴 선택관광 {d.hiddenCount}개 · <Text className="font-semibold text-primary-text">다시 보기</Text>
              </Text>
            </Pressable>
          )}

          {d.extra.length > 0 && (
            <View className="rounded-2xl bg-app px-3.5 py-2.5">
              <Text className="pb-0.5 font-semibold text-[13px] text-ink-500">{d.extraLabel}</Text>
              {d.extra.map((e, i) => (
                <Fragment key={e.id}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onOpenExpense(e.id)}
                    className={`flex-row items-center justify-between gap-2.5 py-2 ${i > 0 ? 'border-t border-muted' : ''}`}
                  >
                    <View className="min-w-0 flex-1">
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        <Text className="font-semibold text-[15px] text-ink">{e.title}</Text>
                        {e.tags.map((t) => (
                          <Tag key={t} label={t} />
                        ))}
                      </View>
                      <Text className="text-xs text-ink-400">{e.who}</Text>
                    </View>
                    <View className="shrink-0 items-end">
                      <Text
                        style={{ fontVariant: ['tabular-nums'] }}
                        className={`font-semibold text-[15px] ${e.mainLocal ? 'text-local' : 'text-ink'}`}
                      >
                        {e.main}
                      </Text>
                      {!!e.sub && <Text className="text-xs text-ink-300">{e.sub}</Text>}
                    </View>
                  </Pressable>
                </Fragment>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
