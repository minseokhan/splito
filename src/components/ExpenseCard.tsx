import { Camera, MessageSquare, Mic, Pencil } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { payerRecorderLabel } from '@/lib/feed';
import { formatForeign, formatKrw } from '@/lib/money';
import type { FeedRow } from '@/services/api';
import { colors } from '@/theme/tokens';

import { Avatar } from './Avatar';
import { Badge } from './Badge';

const SOURCE_ICON = { receipt: Camera, card_image: Camera, card_text: MessageSquare, voice: Mic, manual: Pencil } as const;
const SOURCE_LABEL = { receipt: '영수증', card_image: '결제 캡처', card_text: '카드 문자', voice: '음성', manual: '직접 입력' } as const;

type Props = {
  row: FeedRow;
  payerName: string;
  recorderName: string;
  payerColorIndex: number;
  payerGuest?: boolean;
  onPress: () => void;
};

// UI_GUIDE 지출 카드. 금액은 서버 확정 값만 표시한다.
export function ExpenseCard({ row, payerName, recorderName, payerColorIndex, payerGuest, onPress }: Props) {
  const pending = row.krwAmount === null;
  const foreign = row.currency !== 'KRW';
  const original = formatForeign(row.amountOriginal, row.currency);
  const Icon = SOURCE_ICON[row.source as keyof typeof SOURCE_ICON] ?? Pencil;
  const sourceLabel = SOURCE_LABEL[row.source as keyof typeof SOURCE_LABEL] ?? '';
  const merchant = row.merchant ?? '이름 없는 지출';
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${merchant} ${pending ? `${original} 환율 대기` : formatKrw(row.krwAmount!)}`}
        onPress={onPress}
        className="gap-1 rounded-lg border border-[#E3EAF0] bg-white px-4 py-3"
      >
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 font-semibold text-base text-ink-900" numberOfLines={1}>
            {merchant}
          </Text>
          <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-base text-ink-900">
            {pending ? original : formatKrw(row.krwAmount!)}
          </Text>
        </View>
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-1 flex-row items-center gap-1.5">
            <Avatar name={payerName} colorIndex={payerColorIndex} guest={payerGuest} size={20} />
            {row.paidLocalTime && <Text className="text-[13px] text-ink-500">{row.paidLocalTime.slice(0, 5)}</Text>}
            <Icon size={16} strokeWidth={1.75} color={colors.ink[500]} accessibilityLabel={sourceLabel} />
            <Text className="flex-1 text-[13px] text-ink-500" numberOfLines={1}>
              {payerRecorderLabel(payerName, recorderName)}
            </Text>
          </View>
          {foreign && !pending && (
            <Text style={{ fontVariant: ['tabular-nums'] }} className="text-[13px] text-ink-500">
              {original}
            </Text>
          )}
        </View>
        {(row.needsReview || pending) && (
          <View className="mt-1 flex-row gap-1.5">
            {row.needsReview && <Badge kind="review" />}
            {pending && <Badge kind="pending" />}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
