import { Text, View } from 'react-native';

import type { Krw } from '@/types/domain';

const fmt = new Intl.NumberFormat('ko-KR');

type Props = { net: Krw; size?: 'base' | 'large'; label?: boolean };

// 순잔액: 받을 돈 + #0874BB, 줄 돈 − #D92D20. 색만으로 구분하지 않고 부호와 라벨을 함께 쓴다.
export function Money({ net, size = 'base', label = true }: Props) {
  const abs = `${fmt.format(Math.abs(net))}원`;
  const text = net > 0 ? '받을 돈' : net < 0 ? '줄 돈' : '정산할 돈 없음';
  return (
    <View accessible accessibilityLabel={`${abs} ${text}`} className="items-end">
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className={`font-semibold ${size === 'large' ? 'text-2xl' : 'text-base'} ${netColor(net)}`}
      >
        {netSign(net)}
        {abs}
      </Text>
      {label && <Text className="text-[13px] text-ink-400">{text}</Text>}
    </View>
  );
}

export const netSign = (net: Krw) => (net > 0 ? '+' : net < 0 ? '−' : '');
export const netColor = (net: Krw) => (net > 0 ? 'text-primary-text' : net < 0 ? 'text-danger' : 'text-ink');

export function formatKrw(v: Krw) {
  return `${fmt.format(v)}원`;
}
