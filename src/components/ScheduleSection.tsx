import { Check, Minus, MoreHoriz, Plus, QrCode } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';

import { CategoryCircle } from '@/components/CategoryCircle';
import { formatKrw } from '@/components/Money';
import { Icon } from '@/components/Icon';
import { SpotStatusRow } from '@/components/SpotSettleSheet';
import type { CategoryCode } from '@/lib/category';
import type { ScheduleDay, SchedulableExpense, ScheduleItem } from '@/lib/schedule';
import { colors } from '@/theme/tokens';

// 일정 카드·그 외 지출에 그릴 지출 한 줄. buildScheduleDays가 이 타입 그대로 묶어 돌려준다.
export type ScheduleRow = SchedulableExpense & {
  title: string;
  who: string;
  category: CategoryCode;
  main: string; // 큰 금액. 외화 결제면 현지 통화로 쓴다
  mainLocal: boolean; // 현지 통화면 강조색(local)
  sub: string | null; // 작은 원화 환산. 원화 결제면 없다(노션 11번)
};

/** 일정 카드 아래에 그릴 '이 자리 정산' 상태. 문구·완료 판정은 화면이 만든다(여기는 표시만). */
export type SpotCardState = { text: string; done: boolean };

type Props = {
  days: ScheduleDay<ScheduleRow>[];
  /** 패키지 방: 시간 칸·포함 칩·예정 금액·이 자리 정산을 그린다. 자유여행은 이름만. */
  pkg: boolean;
  /** '…' 메뉴. pageY는 누른 위치(메뉴를 그 아래에 띄운다). */
  onMore: (item: ScheduleItem, pageY: number) => void;
  onAddSchedule: (dayIndex: number) => void;
  onSkip: (scheduleId: string) => void;
  onUnhide: (dayIndex: number) => void;
  onOpenExpense: (expenseId: string) => void;
  /** 보낸 정산만 들어온다. 없으면 [이 자리 정산] 칩을 보여준다. */
  spots: Map<string, SpotCardState>;
  onSpot: (scheduleId: string) => void;
  /** 날짜 탭 바로가기용: 날짜 블록의 y(이 컴포넌트 기준)와 높이. */
};

function Tag({ label }: { label: string }) {
  const warn = label === '선택관광';
  return (
    <View className={`rounded-badge px-1.5 py-px ${warn ? 'bg-warning-badge' : 'bg-muted'}`}>
      <Text className={`font-semibold text-11 ${warn ? 'text-warning' : 'text-ink-500'}`}>{label}</Text>
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
      <Text className={`font-medium text-xs ${on ? 'text-ink-700' : 'text-ink-400'}`}>{label}</Text>
    </View>
  );
}

// 금액: 외화 크게(강조색) + 원화 작게 회색 / 원화 결제는 원화만(노션 11번).
function Amount({ row }: { row: ScheduleRow }) {
  return (
    <View className="shrink-0 items-end">
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className={`font-semibold text-sm ${row.mainLocal ? 'text-local' : 'text-ink'}`}
      >
        {row.main}
      </Text>
      {!!row.sub && (
        <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs text-ink-300">
          {row.sub}
        </Text>
      )}
    </View>
  );
}

// 일정 안 지출 줄: 세로 막대 2px → 10 → 원 28 → 10 → 품목·결제자 + 금액. 누르면 막대 오른쪽만 바탕 app(둥글기 8).
function ExpenseLine({ row, onPress }: { row: ScheduleRow; onPress: () => void }) {
  return (
    <View className="flex-row items-stretch gap-2.5">
      <View className="w-0.5 rounded-full bg-local" />
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="-mr-2 min-w-0 flex-1 flex-row items-center gap-2.5 rounded-badge py-0.5 pr-2 active:bg-app"
      >
        <CategoryCircle code={row.category} />
        <View className="min-w-0 flex-1">
          <Text className="font-medium text-sm text-ink" numberOfLines={1}>
            {row.title}
          </Text>
          <Text className="text-xs text-ink-300" numberOfLines={1}>
            {row.who}
          </Text>
        </View>
        <Amount row={row} />
      </Pressable>
    </View>
  );
}

export function ScheduleSection({
  days,
  pkg,
  onMore,
  onAddSchedule,
  onSkip,
  onUnhide,
  onOpenExpense,
  spots,
  onSpot,
}: Props) {
  return (
    <View className="gap-3 px-5">
      {/* 여행 전은 지출이 있을 때만 — 일정을 더할 수 없는 날이다(명세 §6) */}
      {days
        .filter((d) => d.dayIndex > 0 || d.extra.length > 0)
        .map((d) => (
          <View key={d.key} className="gap-2.5">
            {/* 합계는 날짜 줄에만(원화). 지출 없는 날은 숨긴다 */}
            <View className="flex-row items-center justify-between gap-2 pt-1.5">
              <Text className="font-semibold text-13 text-ink-500">{d.header}</Text>
              {d.hasExpense && (
                <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-13 text-ink">
                  {formatKrw(d.daySum)}
                </Text>
              )}
            </View>

            {d.cards.length > 0 && (
              <View className="rounded-box border border-card-line bg-white py-2">
                {d.cards.map((c) => {
                  const spot = spots.get(c.item.id);
                  const showSpotChip = pkg && c.expenses.length > 0 && !spot;
                  const chips = pkg && (c.item.includes.length > 0 || c.item.excludes.length > 0 || showSpotChip);
                  return (
                    <View key={c.item.id} className="flex-row gap-3 px-4">
                      {/* 점: 위 15(이름 줄 24의 세로 가운데). 지출 있으면 스카이 500으로 채움, 없으면 빈 원 */}
                      <View className="w-2.5 pt-[15px]">
                        <View
                          className={`h-2.5 w-2.5 rounded-full ${c.expenses.length > 0 ? 'bg-sky-500' : 'bg-white'}`}
                          style={c.expenses.length > 0 ? undefined : { borderWidth: 2, borderColor: colors.line.off }}
                        />
                      </View>
                      {/* 행 안쪽 위아래 8 → 행 간격 16, 구분선 없음(일정 카드 명세 §2) */}
                      <View className="min-w-0 flex-1 gap-2 py-2">
                        <View className="min-h-[24px] flex-row items-center gap-2">
                          {pkg && (
                            <Text style={{ fontVariant: ['tabular-nums'] }} className="-mr-2 w-11 text-13 text-ink-300">
                              {c.item.startTime ?? ''}
                            </Text>
                          )}
                          <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-1.5">
                            <Text className="font-semibold text-15 text-ink">{c.item.title}</Text>
                            {c.item.optional && <Tag label="선택관광" />}
                            {c.item.edited && pkg && <Tag label="직접 수정" />}
                          </View>
                          {/* 28×28, 누르면 바탕 muted + 아이콘 ink-500 */}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${c.item.title} 메뉴`}
                            hitSlop={6}
                            onPress={(e) => onMore(c.item, e.nativeEvent.pageY)}
                            className="-my-0.5 -mr-2 h-7 w-7 items-center justify-center rounded-badge active:bg-muted"
                          >
                            {({ pressed }) => <Icon as={MoreHoriz} size={18} color={pressed ? colors.ink[500] : colors.ink[300]} />}
                          </Pressable>
                        </View>

                        {chips && (
                          <View className="flex-row items-start gap-2">
                            <View className="min-w-0 flex-1 flex-row flex-wrap gap-1">
                              {c.item.includes.map((l) => (
                                <IncludeChip key={l} label={l} on />
                              ))}
                              {c.item.excludes.map((l) => (
                                <IncludeChip key={l} label={l} on={false} />
                              ))}
                            </View>
                            {showSpotChip && (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`${c.item.title} 이 자리 정산`}
                                onPress={() => onSpot(c.item.id)}
                                className="h-6 flex-row items-center gap-[3px] rounded-full border border-line bg-white px-[9px] active:border-sky-200"
                              >
                                <Icon as={QrCode} size={13} color={colors.ink.DEFAULT} />
                                <Text className="font-semibold text-xs text-ink">이 자리 정산</Text>
                              </Pressable>
                            )}
                          </View>
                        )}

                        {pkg && c.showEst && (
                          <View className="flex-row items-center justify-between rounded-badge bg-warning-banner px-2.5 py-[7px]">
                            <Text className="font-semibold text-13 text-warning">
                              예정 · 약 {formatKrw(c.item.estAmount)}
                            </Text>
                            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onSkip(c.item.id)}>
                              <Text className="font-semibold text-13 text-ink-400">안 해요</Text>
                            </Pressable>
                          </View>
                        )}

                        {c.expenses.length > 0 && (
                          <View className="gap-1.5">
                            {c.expenses.map((e) => (
                              <ExpenseLine key={e.id} row={e} onPress={() => onOpenExpense(e.id)} />
                            ))}
                          </View>
                        )}

                        {/* 보낸 정산이 있으면 칩 대신 상태 줄. 누르면 시트가 다시 열린다(명세 §1) */}
                        {pkg && spot && <SpotStatusRow text={spot.text} done={spot.done} onPress={() => onSpot(c.item.id)} />}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {d.extra.length > 0 && (
              <View className="gap-1.5">
                {/* 여행 전은 날짜 줄이 이미 같은 말이라 라벨을 쓰지 않는다 */}
                {d.dayIndex > 0 && <Text className="pl-1 text-13 text-ink-500">{d.extraLabel}</Text>}
                <View className="gap-0.5 rounded-box bg-app py-2">
                  {d.extra.map((e) => (
                    <Pressable
                      key={e.id}
                      accessibilityRole="button"
                      onPress={() => onOpenExpense(e.id)}
                      className="flex-row items-center gap-2.5 px-4 py-2"
                    >
                      <CategoryCircle code={e.category} onGray />
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="font-semibold text-sm text-ink" numberOfLines={1}>
                          {e.title}
                        </Text>
                        <Text className="text-xs text-ink-300" numberOfLines={1}>
                          {e.who}
                        </Text>
                      </View>
                      <Amount row={e} />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* '여행 전'에는 일정을 더할 수 없다(명세 §6) */}
            {d.dayIndex > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => onAddSchedule(d.dayIndex)}
                className="h-10 flex-row items-center justify-center gap-1 rounded-button border border-line-off"
              >
                <Icon as={Plus} size={15} color={colors.ink[500]} />
                <Text className="font-semibold text-13 text-ink-500">일정 추가</Text>
              </Pressable>
            )}

            {d.hiddenCount > 0 && (
              <Pressable accessibilityRole="button" onPress={() => onUnhide(d.dayIndex)} className="pl-12">
                <Text className="text-xs text-ink-500">
                  숨긴 선택관광 {d.hiddenCount}개 · <Text className="font-semibold text-primary-text">다시 보기</Text>
                </Text>
              </Pressable>
            )}
          </View>
        ))}
    </View>
  );
}
