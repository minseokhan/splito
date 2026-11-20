import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// 영수증 티켓 장식(18번 ③). 둘 다 화면 배경색(app)으로 카드를 '파낸' 것처럼 그린다 — 카드는 overflow-hidden이어야 한다.

// 절취선: 양옆 반원 홈 18px + 가운데 1.5px 점선.
export function Perforation() {
  return (
    <View className="h-[18px] justify-center">
      <View className="absolute -left-[9px] h-[18px] w-[18px] rounded-full bg-app" />
      <View className="absolute -right-[9px] h-[18px] w-[18px] rounded-full bg-app" />
      <View className="px-5">
        <Svg height={2} width="100%">
          <Line x1="0" y1="1" x2="100%" y2="1" stroke={colors.line.DEFAULT} strokeWidth={1.5} strokeDasharray="4 4" />
        </Svg>
      </View>
    </View>
  );
}

// 바닥 물결: 지름 14px 반원을 이어 붙인다. ponytail: 40개 고정(560px) — 그보다 넓은 화면이면 늘린다.
export function WavyBottom() {
  return (
    <View className="h-[7px] flex-row overflow-hidden">
      {Array.from({ length: 40 }, (_, i) => (
        <View key={i} className="h-[14px] w-[14px] rounded-full bg-app" />
      ))}
    </View>
  );
}
