import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { payerRecorderLabel } from '@/lib/feed';
import { formatForeign, formatKrw } from '@/lib/money';
import type { FeedRow } from '@/services/api';

import { Badge } from './Badge';
import { CategoryCircle } from './CategoryCircle';

type Props = { row: FeedRow; payerName: string; recorderName: string; onPress: () => void };

// 지출 내역 한 줄(최소 높이 64 · 위아래 10 · 좌우 16). 구분선 없이 여백으로 나눈다(노션 13번). 누르면 바탕 app.
// 금액은 결제한 통화를 크게(외화면 local 강조색), 확정 원화를 작게 아래에 둔다. 원화 결제는 원화만(11번).
export function ExpenseCard({ row, payerName, recorderName, onPress }: Props) {
  const pending = row.krwAmount === null;
  const foreign = row.currency !== 'KRW';
  const original = formatForeign(row.amountOriginal, row.currency);
  const merchant = row.merchant ?? '이름 없는 지출';
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${merchant} ${pending ? `${original} 환율 대기` : formatKrw(row.krwAmount!)}`}
        onPress={onPress}
        className="min-h-16 flex-row items-center gap-2.5 px-4 py-2.5 active:bg-app"
      >
        <CategoryCircle code={row.category} size={40} />
        <View className="flex-1 gap-[3px]">
          <View className="flex-row items-center gap-1.5">
            <Text className="shrink font-semibold text-15 text-ink" numberOfLines={1}>
              {merchant}
            </Text>
            {row.visibility === 'private' && <Badge kind="private" />}
            {row.needsReview && <Badge kind="review" />}
          </View>
          <Text className="text-13 text-ink-400" numberOfLines={1}>
            {payerRecorderLabel(payerName, recorderName)}
          </Text>
        </View>
        <View className="items-end gap-[2px]">
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className={`font-semibold text-15 ${foreign ? 'text-local' : 'text-ink'}`}
          >
            {original}
          </Text>
          {pending ? (
            <View className="flex-row">
              <Badge kind="pending" />
            </View>
          ) : (
            foreign && (
              <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs text-ink-300">
                {formatKrw(row.krwAmount!)}
              </Text>
            )
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
