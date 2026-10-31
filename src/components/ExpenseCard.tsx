import { Camera, EditPencil, MessageText, Microphone } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { payerRecorderLabel } from '@/lib/feed';
import { formatForeign, formatKrw } from '@/lib/money';
import type { FeedRow } from '@/services/api';
import { colors } from '@/theme/tokens';

import { Badge } from './Badge';
import { Icon } from './Icon';

const SOURCE_ICON = { receipt: Camera, card_image: Camera, card_text: MessageText, voice: Microphone, manual: EditPencil } as const;
const SOURCE_LABEL = { receipt: '영수증', card_image: '결제 캡처', card_text: '카드 문자', voice: '음성', manual: '직접 입력' } as const;

type Props = { row: FeedRow; payerName: string; recorderName: string; onPress: () => void };

// 피드 한 줄(날짜 그룹 카드 안). 구분선은 화면이 그린다. 금액은 서버 확정 값만 표시한다.
export function ExpenseCard({ row, payerName, recorderName, onPress }: Props) {
  const pending = row.krwAmount === null;
  const foreign = row.currency !== 'KRW';
  const original = formatForeign(row.amountOriginal, row.currency);
  const source = SOURCE_ICON[row.source as keyof typeof SOURCE_ICON] ?? EditPencil;
  const sourceLabel = SOURCE_LABEL[row.source as keyof typeof SOURCE_LABEL] ?? '';
  const merchant = row.merchant ?? '이름 없는 지출';
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${merchant} ${pending ? `${original} 환율 대기` : formatKrw(row.krwAmount!)}`}
        onPress={onPress}
        className="flex-row items-center gap-3 py-3.5"
      >
        <View className="h-11 w-11 items-center justify-center rounded-input bg-muted">
          <Icon as={source} size={21} color={colors.primary.text} accessibilityLabel={sourceLabel} />
        </View>
        <View className="flex-1 gap-[3px]">
          <View className="flex-row items-center gap-1.5">
            <Text className="shrink font-bold text-base text-ink" numberOfLines={1}>
              {merchant}
            </Text>
            {row.needsReview && <Badge kind="review" />}
          </View>
          <Text className="text-[13px] text-ink-400" numberOfLines={1}>
            {payerRecorderLabel(payerName, recorderName)}
          </Text>
        </View>
        <View className="items-end gap-[3px]">
          <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-base text-ink">
            {pending ? original : formatKrw(row.krwAmount!)}
          </Text>
          {pending ? (
            <View className="flex-row">
              <Badge kind="pending" />
            </View>
          ) : (
            foreign && (
              <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs text-ink-400">
                {original}
              </Text>
            )
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
