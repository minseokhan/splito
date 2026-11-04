import { NavArrowRight } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';

import type { CategoryRow } from '@/lib/budget';
import type { CategoryCode } from '@/lib/category';
import { colors } from '@/theme/tokens';
import type { Krw } from '@/types/domain';

import { CATEGORY_ICON } from './categoryIcon';
import { Icon } from './Icon';
import { formatKrw } from './Money';

const CARD = { boxShadow: '0 2px 8px -2px rgba(19,25,39,.06)' };

// 막대 영역 높이. 위 금액(14) + 아래 일차 라벨(16) + 간격을 빼고 남은 값.
const BAR_MAX = 100;
const LABEL_H = 16;

type CompareProps = {
  top: string;
  bottom: string;
  daily: Krw[];
  /** 하루 권장 기준선(budget / N). 0이면 그리지 않는다. */
  baseline: Krw;
  /** 오늘이 몇 일차인지(1부터). */
  d: number;
  /** 기간 칩으로 고른 일차(0-based). 없으면 null. */
  selected: number | null;
};

/** 전날 대비 카드 + 일차별 막대(명세 §6-1). 숙소는 집계에서 빠져 있다. */
export function CompareCard({ top, bottom, daily, baseline, d, selected }: CompareProps) {
  const max = Math.max(baseline, ...daily, 1);
  const h = (v: number) => Math.max(4, Math.round((v / max) * BAR_MAX));

  return (
    <View style={CARD} className="gap-3.5 rounded-card bg-white px-5 py-[18px]">
      <Text className="font-semibold text-lg leading-[1.4] text-ink">
        {top}
        {!!bottom && `\n${bottom}`}
      </Text>
      <View className="h-[150px] flex-row items-end gap-3.5 pt-2.5">
        {baseline > 0 && (
          <>
            <View
              pointerEvents="none"
              style={{ bottom: LABEL_H + 4 + h(baseline), borderTopWidth: 1.5, borderColor: colors.warning.bar, borderStyle: 'dashed' }}
              className="absolute left-0 right-0 z-10"
            />
            <Text
              style={{ bottom: LABEL_H + 8 + h(baseline) }}
              className="absolute right-0 z-20 bg-white px-1 font-semibold text-[11px] text-warning-accent"
            >
              하루 권장 {formatKrw(baseline)}
            </Text>
          </>
        )}
        {daily.map((v, i) => {
          const future = i > d - 1;
          const on = selected === null ? i === d - 1 : i === selected;
          return (
            <View key={i} className="h-full flex-1 items-center justify-end gap-1">
              <Text numberOfLines={1} adjustsFontSizeToFit className="font-semibold text-[11px] text-ink-500">
                {future ? '' : formatKrw(v)}
              </Text>
              <View
                style={{
                  height: future ? BAR_MAX / 3 : h(v),
                  maxWidth: 44,
                  backgroundColor: future ? 'transparent' : on ? colors.primary.DEFAULT : colors.sky[200],
                  borderWidth: future ? 1.5 : 0,
                  borderColor: colors.line.DEFAULT,
                  borderStyle: 'dashed',
                }}
                className="w-full rounded-t-[8px]"
              />
              <Text style={{ height: LABEL_H }} className={`text-xs ${on ? 'font-semibold text-ink' : 'text-ink-400'}`}>
                {i + 1}일차
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** 카테고리별 지출(명세 §6-2). 숙소도 보여준다. */
export function CategoryCard({ rows, onPick }: { rows: CategoryRow[]; onPick: (code: CategoryCode) => void }) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <View style={CARD} className="gap-1 rounded-card bg-white px-5 pb-2 pt-[18px]">
      <View className="flex-row items-baseline justify-between pb-1.5">
        <Text className="font-semibold text-base text-ink">카테고리별 지출</Text>
        <Text className="text-[13px] text-ink-500">{formatKrw(total)}</Text>
      </View>
      {rows.map((r, i) => (
        <Pressable
          key={r.code}
          accessibilityRole="button"
          accessibilityLabel={`${r.label} ${formatKrw(r.amount)}`}
          onPress={() => onPick(r.code)}
          className={`flex-row items-center gap-3 py-2.5 ${i < rows.length - 1 ? 'border-b border-line-row' : ''}`}
        >
          <View className="h-9 w-9 items-center justify-center rounded-chip bg-muted">
            <Icon as={CATEGORY_ICON[r.code]} size={18} color={colors.primary.text} />
          </View>
          <View className="min-w-0 flex-1 gap-[5px]">
            <View className="flex-row items-baseline justify-between">
              <Text className="font-semibold text-[15px] text-ink">
                {r.label} <Text className="font-medium text-xs text-ink-400">{Math.round(r.ratio * 100)}%</Text>
              </Text>
              <Text className="font-semibold text-[15px] text-ink">{formatKrw(r.amount)}</Text>
            </View>
            <View className="h-1.5 rounded-full bg-[#EEF0F3]">
              <View style={{ width: `${Math.round(r.ratio * 100)}%` }} className="h-full rounded-full bg-primary" />
            </View>
          </View>
          <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
        </Pressable>
      ))}
    </View>
  );
}

export type MateRow = { id: string; name: string; initial: string; tint: string; fg: string; paid: Krw; owed: Krw };

/** 동행별 지출(명세 §6-3). 공동 지출만, room_balances의 paid·owed를 그대로 쓴다. */
export function MatesCard({ rows }: { rows: MateRow[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.paid, r.owed]));
  const w = (v: number) => `${Math.round((v / max) * 100)}%` as const;
  return (
    <View style={CARD} className="gap-3.5 rounded-card bg-white px-5 py-[18px]">
      <Text className="font-semibold text-base text-ink">동행별 지출</Text>
      <View className="flex-row gap-3.5">
        {[
          { label: '결제한 돈', color: colors.primary.DEFAULT },
          { label: '쓴 돈', color: colors.sky[200] },
        ].map((l) => (
          <View key={l.label} className="flex-row items-center gap-1.5">
            <View style={{ backgroundColor: l.color }} className="h-2.5 w-2.5 rounded-[3px]" />
            <Text className="text-xs text-ink-500">{l.label}</Text>
          </View>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.id} className="flex-row items-center gap-3">
          <View className="w-10 items-center">
            <View style={{ backgroundColor: r.tint }} className="h-8 w-8 items-center justify-center rounded-full">
              <Text style={{ color: r.fg }} className="font-semibold text-[13px]">
                {r.initial}
              </Text>
            </View>
            <Text numberOfLines={1} className="text-[11px] text-ink-400">
              {r.name}
            </Text>
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <View className="h-2 flex-1 rounded-full bg-app">
                <View style={{ width: w(r.paid) }} className="h-full rounded-full bg-primary" />
              </View>
              <Text className="w-[76px] text-right font-semibold text-xs text-ink">{formatKrw(r.paid)}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="h-2 flex-1 rounded-full bg-app">
                <View style={{ width: w(r.owed) }} className="h-full rounded-full bg-sky-200" />
              </View>
              <Text className="w-[76px] text-right text-xs text-ink-500">{formatKrw(r.owed)}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
