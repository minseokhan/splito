import { Lock, NavArrowRight } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';
import Svg, { Defs, FeGaussianBlur, Filter, G, Rect } from 'react-native-svg';

import type { CategoryRow } from '@/lib/budget';
import type { CategoryCode } from '@/lib/category';
import { colors } from '@/theme/tokens';
import type { Krw } from '@/types/domain';

import { CategoryCircle } from './CategoryCircle';
import { Icon } from './Icon';
import { formatKrw } from './Money';

const CARD = { boxShadow: '0 2px 8px -2px rgba(19,25,39,.06)' };
// 여행 패스 없음(잠금) 표시: RN Text에는 CSS blur가 없어 글자를 투명하게 하고 그림자만 번지게 한다.
// ponytail: 값은 화면에 그대로 있다. 실제 유료화 때는 서버가 금액을 내려주지 않아야 한다.
const blurText = (radius: number) => ({
  color: 'transparent',
  textShadowColor: 'rgba(83,87,100,.6)',
  textShadowRadius: radius,
  textShadowOffset: { width: 0, height: 0 },
});

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
  /** 여행 패스 없음: 막대 위 금액을 흐리게 한다. */
  locked?: boolean;
};

/** 전날 대비 카드 + 일차별 막대(명세 §6-1). 숙소는 집계에서 빠져 있다. */
export function CompareCard({ top, bottom, daily, baseline, d, selected, locked }: CompareProps) {
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
              하루 권장 {locked ? '???원' : formatKrw(baseline)}
            </Text>
          </>
        )}
        {daily.map((v, i) => {
          const future = i > d - 1;
          const on = selected === null ? i === d - 1 : i === selected;
          return (
            <View key={i} className="h-full flex-1 items-center justify-end gap-1">
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={locked ? blurText(8) : undefined}
                className="font-semibold text-[11px] text-ink-500"
              >
                {future ? '' : formatKrw(v)}
              </Text>
              <View
                style={{
                  height: future ? BAR_MAX / 3 : h(v),
                  maxWidth: 44,
                  backgroundColor: future ? 'transparent' : on ? colors.primary.text : colors.sky[200],
                  borderWidth: future ? 1.5 : 0,
                  borderColor: colors.line.DEFAULT,
                  borderStyle: 'dashed',
                }}
                className="w-full rounded-t-badge"
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
/** locked면 비율(%)만 보이고 금액은 '???원'으로 가린다. 행을 누르면 onPick 대신 onLocked. */
export function CategoryCard({
  rows,
  onPick,
  locked,
  onLocked,
}: {
  rows: CategoryRow[];
  onPick: (code: CategoryCode) => void;
  locked?: boolean;
  onLocked?: () => void;
}) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <View style={CARD} className="gap-1 rounded-card bg-white px-5 pb-2 pt-[18px]">
      <View className="flex-row items-baseline justify-between pb-1.5">
        <Text className="font-semibold text-base text-ink">카테고리별 지출</Text>
        <Text style={locked ? blurText(10) : undefined} className="text-[13px] text-ink-500">
          {formatKrw(total)}
        </Text>
      </View>
      {rows.map((r, i) => (
        <Pressable
          key={r.code}
          accessibilityRole="button"
          accessibilityLabel={locked ? r.label : `${r.label} ${formatKrw(r.amount)}`}
          onPress={() => (locked ? onLocked?.() : onPick(r.code))}
          className={`flex-row items-center gap-3 py-2.5 ${i < rows.length - 1 ? 'border-b border-line-row' : ''}`}
        >
          <CategoryCircle code={r.code} size={40} />
          <View className={`min-w-0 flex-1 ${locked ? 'gap-1.5' : 'gap-[5px]'}`}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-baseline gap-1.5">
                <Text className="font-semibold text-[15px] text-ink">{r.label}</Text>
                <Text className="font-medium text-xs text-ink-400">{locked ? '??%' : `${Math.round(r.ratio * 100)}%`}</Text>
              </View>
              {locked ? (
                <View className="h-[22px] flex-row items-center gap-1 rounded-full bg-muted px-2">
                  <Icon as={Lock} size={12} color={colors.ink[400]} />
                  <Text className="font-semibold text-xs text-ink-400">???원</Text>
                </View>
              ) : (
                <Text className="font-semibold text-[15px] text-ink">{formatKrw(r.amount)}</Text>
              )}
            </View>
            <View className="h-1.5 rounded-full bg-muted">
              <View style={{ width: `${Math.round(r.ratio * 100)}%`, backgroundColor: colors.cat[r.code].chart }} className="h-full rounded-full" />
            </View>
          </View>
          <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
        </Pressable>
      ))}
    </View>
  );
}

/** masked: 여행 패스 없음일 때 다른 동행의 금액을 가린다(내 금액은 보인다). */
export type MateRow = { id: string; name: string; initial: string; tint: string; fg: string; paid: Krw; owed: Krw; masked?: boolean };

// 가린 동행의 막대(시안 blur 3px). View에는 iOS blur가 없어 SVG 가우시안 블러로 그린다.
// 번진 가장자리가 잘리지 않게 위아래 3px씩 더 그리고 음수 여백으로 자리를 맞춘다.
function BlurBar({ width, color }: { width: `${number}%`; color: string }) {
  return (
    <Svg height={14} style={{ flex: 1, marginVertical: -3 }}>
      <Defs>
        <Filter id="blur" x="-5%" y="-50%" width="110%" height="200%">
          <FeGaussianBlur stdDeviation={2.5} />
        </Filter>
      </Defs>
      <G filter="url(#blur)">
        <Rect x="0" y="3" width="100%" height="8" rx="4" fill={colors.app} />
        <Rect x="0" y="3" width={width} height="8" rx="4" fill={color} />
      </G>
    </Svg>
  );
}

/** 동행별 지출(명세 §6-3). 공동 지출만, room_balances의 paid·owed를 그대로 쓴다. */
export function MatesCard({ rows, onLocked }: { rows: MateRow[]; onLocked?: () => void }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.paid, r.owed]));
  const w = (v: number) => `${Math.round((v / max) * 100)}%` as const;
  return (
    <View style={CARD} className="gap-3.5 rounded-card bg-white px-5 py-[18px]">
      <Text className="font-semibold text-base text-ink">동행별 지출</Text>
      <View className="flex-row gap-3.5">
        {[
          { label: '결제한 돈', color: colors.primary.text },
          { label: '쓴 돈', color: colors.sky[200] },
        ].map((l) => (
          <View key={l.label} className="flex-row items-center gap-1.5">
            <View style={{ backgroundColor: l.color }} className="h-2.5 w-2.5 rounded-full" />
            <Text className="text-xs text-ink-500">{l.label}</Text>
          </View>
        ))}
      </View>
      {rows.map((r) => (
        <Pressable key={r.id} disabled={!r.masked} onPress={onLocked} className="flex-row items-center gap-3">
          <View className="w-10 items-center gap-1">
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
              {r.masked ? (
                <BlurBar width={w(r.paid)} color={colors.primary.text} />
              ) : (
                <View className="h-2 flex-1 rounded-full bg-app">
                  <View style={{ width: w(r.paid) }} className="h-full rounded-full bg-primary-text" />
                </View>
              )}
              <Text className={`w-[76px] text-right font-semibold text-xs ${r.masked ? 'text-ink-300' : 'text-ink'}`}>
                {r.masked ? '???원' : formatKrw(r.paid)}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              {r.masked ? (
                <BlurBar width={w(r.owed)} color={colors.sky[200]} />
              ) : (
                <View className="h-2 flex-1 rounded-full bg-app">
                  <View style={{ width: w(r.owed) }} className="h-full rounded-full bg-sky-200" />
                </View>
              )}
              <Text className={`w-[76px] text-right text-xs ${r.masked ? 'text-ink-300' : 'text-ink-500'}`}>
                {r.masked ? '???원' : formatKrw(r.owed)}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
