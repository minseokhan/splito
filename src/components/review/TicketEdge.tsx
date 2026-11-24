import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// 영수증 티켓 장식(18번 ③). 둘 다 화면 배경색(canvas)으로 카드를 '파낸' 것처럼 그린다 — 카드는 overflow-hidden이어야 한다.

// 절취선: 높이 20(위아래 4 여백) + 양옆 반원 홈 18px + 가운데 1.5px 점선.
export function Perforation() {
  return (
    <View className="my-1 h-5 justify-center">
      <View className="absolute -left-[9px] top-px h-[18px] w-[18px] rounded-full bg-canvas" />
      <View className="absolute -right-[9px] top-px h-[18px] w-[18px] rounded-full bg-canvas" />
      <View className="px-5">
        <Svg height={2} width="100%">
          <Line x1="0" y1="1" x2="100%" y2="1" stroke={colors.line.DEFAULT} strokeWidth={1.5} strokeDasharray="4 4" />
        </Svg>
      </View>
    </View>
  );
}

// 바닥 물결: 높이 12 흰 띠에서 24px마다 반지름 7 반원을 파낸다(시안 radial-gradient 24×12).
// ponytail: 24개 고정(576px) — 그보다 넓은 화면이면 늘린다.
export function WavyBottom() {
  return (
    <View className="h-3 flex-row overflow-hidden">
      {Array.from({ length: 24 }, (_, i) => (
        <View key={i} className="h-3 w-6 bg-white">
          <View className="absolute left-[5px] top-[5px] h-[14px] w-[14px] rounded-full bg-canvas" />
        </View>
      ))}
    </View>
  );
}
