import { Text, View } from 'react-native';

import type { RoomStatus } from '@/types/domain';

export const STATUS_LABEL: Record<RoomStatus, string> = {
  settled: '정산 완료',
  settling: '정산 중',
  shared: '함께 기록 중',
  solo: '기록 중',
};

// 상태 칩 12/600, 흰 배경 radius 8, padding 4×8. 정산 중만 primary-text, 그 외 ink-500.
export function StatusChip({ status, suffix }: { status: RoomStatus; suffix?: string }) {
  const fg = status === 'settling' ? 'text-primary-text' : status === 'settled' ? 'text-success' : 'text-ink-500';
  return (
    <View className="self-start rounded-badge bg-white px-2 py-1">
      <Text className={`font-semibold text-xs ${fg}`}>
        {STATUS_LABEL[status]}
        {suffix ? ` · ${suffix}` : ''}
      </Text>
    </View>
  );
}
