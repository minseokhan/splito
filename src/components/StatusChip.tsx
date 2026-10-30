import { Text, View } from 'react-native';

import type { RoomStatus } from '@/types/domain';

const STYLE: Record<RoomStatus, { label: string; bg: string; fg: string }> = {
  settled: { label: '정산 완료', bg: 'bg-done-bg', fg: 'text-done-fg' },
  settling: { label: '정산 중', bg: 'bg-sky-200', fg: 'text-ink-900' },
  shared: { label: '함께 기록 중', bg: 'bg-sky-100', fg: 'text-ink-700' },
  solo: { label: '기록 중', bg: 'bg-pending-bg', fg: 'text-pending-fg' },
};

export function StatusChip({ status }: { status: RoomStatus }) {
  const s = STYLE[status];
  return (
    <View className={`self-start rounded-md px-2 py-1 ${s.bg}`}>
      <Text className={`font-semibold text-xs ${s.fg}`}>{s.label}</Text>
    </View>
  );
}
