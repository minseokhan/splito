import { Text, View } from 'react-native';

import type { Krw } from '@/types/domain';

const fmt = new Intl.NumberFormat('ko-KR');

type Props = { net: Krw; size?: 'base' | 'large' };

// 순잔액 표시: 색만으로 구분하지 않고 부호와 "받을 돈/줄 돈" 라벨을 함께 쓴다.
export function Money({ net, size = 'base' }: Props) {
  const abs = `${fmt.format(Math.abs(net))}원`;
  const label = net > 0 ? '받을 돈' : net < 0 ? '줄 돈' : '정산할 돈 없음';
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  const color = net > 0 ? 'text-plus' : net < 0 ? 'text-minus' : 'text-ink-900';
  return (
    <View accessible accessibilityLabel={`${abs} ${label}`} className="items-end">
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className={`font-bold ${size === 'large' ? 'text-[28px]' : 'text-base'} ${color}`}
      >
        {sign}
        {abs}
      </Text>
      <Text className="text-[13px] text-ink-500">{label}</Text>
    </View>
  );
}

export function formatKrw(v: Krw) {
  return `${fmt.format(v)}원`;
}
