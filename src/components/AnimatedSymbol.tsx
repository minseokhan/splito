import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { SplitoSymbol } from './Logo';

// assets/logo/svg/splito-symbol-animated.svg 의 @keyframes sp-pop 을 RN Animated로 옮긴 것이다.
// react-native-svg는 SVG 안의 CSS 애니메이션을 해석하지 않으므로 카드 2장을 별개 레이어로 겹쳐 움직인다.
// 값이 핸드오프와 어긋나면 AnimatedSymbol.test.ts가 깨진다.
export const POP_CYCLE_MS = 2800;
export const POP_EASING = [0.34, 1.56, 0.64, 1] as const;
export const YELLOW_DELAY_MS = 120;
// at = 주기 내 비율, y = viewBox 100 기준 translateY.
export const POP_KEYFRAMES = [
  { at: 0, y: 0 },
  { at: 0.14, y: -10 },
  { at: 0.26, y: 1.6 },
  { at: 0.33, y: -1.8 },
  { at: 0.4, y: 0 },
] as const;

const ACTIVE_MS = POP_KEYFRAMES[POP_KEYFRAMES.length - 1].at * POP_CYCLE_MS; // 1120ms
const TILE_RADIUS_RATIO = 25.7 / 100; // 앱 아이콘 타일의 rx(=SplitoSymbol appIcon)

function popCycle(value: Animated.Value, scale: number, delay: number) {
  const easing = Easing.bezier(...POP_EASING);
  const steps = POP_KEYFRAMES.slice(1).map((frame, i) =>
    Animated.timing(value, {
      toValue: frame.y * scale,
      duration: (frame.at - POP_KEYFRAMES[i].at) * POP_CYCLE_MS,
      easing,
      useNativeDriver: true,
    }),
  );
  // 딜레이를 주기 안에서 상쇄해 두 카드의 주기를 모두 2.8초로 유지한다(CSS animation-delay와 같게).
  return Animated.sequence([Animated.delay(delay), ...steps, Animated.delay(POP_CYCLE_MS - ACTIVE_MS - delay)]);
}

// 앱 아이콘 구도(흰 둥근 타일 + 심볼)에 카드 튕김 애니메이션을 입힌 것. 로그인 히어로가 쓴다.
// 지갑이 카드 앞에 와야 하므로 타일·카드·지갑을 겹친 레이어로 그린다(한 <Svg> 안에서는 못 움직인다).
// 동작 줄이기가 켜져 있으면 멈춘 상태로 보인다.
export function AnimatedSplitoSymbol({ size }: { size: number }) {
  const [mint] = useState(() => new Animated.Value(0)); // useRef(...).current는 렌더 중 ref 접근이라 lint에 걸린다
  const [yellow] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState<boolean>();

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () => setReduced(false));
  }, []);

  useEffect(() => {
    if (reduced !== false) return;
    const scale = size / 100;
    const loop = Animated.loop(
      Animated.parallel([popCycle(mint, scale, 0), popCycle(yellow, scale, YELLOW_DELAY_MS)]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, size, mint, yellow]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="스플리토"
      style={{ width: size, height: size, borderRadius: size * TILE_RADIUS_RATIO, backgroundColor: '#FFFFFF' }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: mint }] }]}>
        <SplitoSymbol size={size} layer="mint" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: yellow }] }]}>
        <SplitoSymbol size={size} layer="yellow" />
      </Animated.View>
      <View style={StyleSheet.absoluteFill}>
        <SplitoSymbol size={size} layer="wallet" />
      </View>
    </View>
  );
}
