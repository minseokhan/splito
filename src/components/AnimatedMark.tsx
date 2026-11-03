import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

import { MARK_TILE_RADIUS_RATIO, SplitoMark } from './Logo';

// assets/logo/svg/splito-landing-icon.svg 의 @keyframes 를 RN Animated로 옮긴 것이다.
// react-native-svg는 SVG 안의 CSS 애니메이션을 해석하지 않으므로 도형을 겹친 레이어로 따로 움직인다.
// 값이 핸드오프와 어긋나면 AnimatedMark.test.ts가 깨진다.

// 등장(1회). delay/duration은 ms, easing은 cubic-bezier 네 값.
export const INTRO = {
  tile: { delay: 0, duration: 700, easing: [0.34, 1.56, 0.64, 1] },
  s: { delay: 350, duration: 800, easing: [0.22, 1, 0.36, 1] },
  tri: { delay: 900, duration: 550, easing: [0.22, 1, 0.36, 1] },
  star: { delay: 1150, duration: 600, easing: [0.34, 1.56, 0.64, 1] },
} as const;

// 반복(무한). 주기는 전부 3.6초이고 시작 시각만 다르다.
export const LOOP_MS = 3600;
export const LOOP_DELAY = { tri: 2400, star: 2600, miniA: 2800, miniB: 3000 } as const;

// at = 주기 내 비율. x는 viewBox 100 기준 translateX, s는 scale, r은 deg, o는 opacity.
export const GO_FRAMES = [
  { at: 0, x: 0 },
  { at: 0.7, x: 0 },
  { at: 0.78, x: 3.5 },
  { at: 0.86, x: -1 },
  { at: 0.92, x: 0 },
  { at: 1, x: 0 },
] as const;
export const TWINKLE_FRAMES = [
  { at: 0, s: 1, r: 0 },
  { at: 0.6, s: 1, r: 0 },
  { at: 0.68, s: 0.78, r: 30 },
  { at: 0.78, s: 1.15, r: 45 },
  { at: 0.88, s: 1, r: 90 },
  { at: 1, s: 1, r: 0 },
] as const;
export const MINI_FRAMES = [
  { at: 0, o: 0, s: 0 },
  { at: 0.62, o: 0, s: 0 },
  { at: 0.74, o: 1, s: 1 },
  { at: 0.88, o: 0, s: 0.4 },
  { at: 1, o: 0, s: 0 },
] as const;

type Frame = { at: number };
const track = <K extends string>(frames: readonly (Frame & Record<K, number>)[], key: K) => ({
  inputRange: frames.map((f) => f.at),
  outputRange: frames.map((f) => f[key]),
});
const deg = <K extends string>(frames: readonly (Frame & Record<K, number>)[], key: K) => ({
  inputRange: frames.map((f) => f.at),
  outputRange: frames.map((f) => `${f[key]}deg`),
});

// 0 → 1 로 한 번 흐르는 값. 등장은 지연 후 duration, 반복은 지연 후 무한 루프.
function runOnce(value: Animated.Value, { delay, duration, easing }: { delay: number; duration: number; easing: readonly [number, number, number, number] }) {
  return Animated.sequence([
    Animated.delay(delay),
    Animated.timing(value, { toValue: 1, duration, easing: Easing.bezier(...easing), useNativeDriver: true }),
  ]);
}
function runLoop(value: Animated.Value, delay: number) {
  return Animated.sequence([
    Animated.delay(delay),
    Animated.loop(
      Animated.timing(value, { toValue: 1, duration: LOOP_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ),
  ]);
}

/**
 * 랜딩(로그인) 히어로의 앱 아이콘. 흰 타일이 통통 튀며 등장 → S → 삼각형 → 별 순으로 들어오고,
 * 이후 3.6초마다 삼각형이 '출발'하고 별이 반짝인다. 동작 줄이기가 켜져 있으면 완성 상태로 멈춘다.
 */
export function AnimatedSplitoMark({ size }: { size: number }) {
  const [v] = useState(() => ({
    tile: new Animated.Value(0),
    s: new Animated.Value(0),
    tri: new Animated.Value(0),
    star: new Animated.Value(0),
    goLoop: new Animated.Value(0),
    starLoop: new Animated.Value(0),
    miniA: new Animated.Value(0),
    miniB: new Animated.Value(0),
  }));
  const [reduced, setReduced] = useState<boolean>();

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () => setReduced(false));
  }, []);

  useEffect(() => {
    if (reduced !== false) return;
    const anim = Animated.parallel([
      runOnce(v.tile, INTRO.tile),
      runOnce(v.s, INTRO.s),
      runOnce(v.tri, INTRO.tri),
      runOnce(v.star, INTRO.star),
      runLoop(v.goLoop, LOOP_DELAY.tri),
      runLoop(v.starLoop, LOOP_DELAY.star),
      runLoop(v.miniA, LOOP_DELAY.miniA),
      runLoop(v.miniB, LOOP_DELAY.miniB),
    ]);
    anim.start();
    return () => anim.stop();
  }, [reduced, v]);

  // viewBox 1칸 = size/100 px. 레이어는 전부 bleed viewBox(124)로 그려 밖으로 나가도 안 잘린다.
  const u = size / 100;
  const bleed = size * 0.12; // (124-100)/2 = 12% 가 사방으로 더 그려진다
  const layer = { position: 'absolute', left: -bleed, top: -bleed } as const;

  // 동작 줄이기: 애니메이션 없이 완성 상태를 그대로 그린다.
  if (reduced !== false) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel="스플리토" style={{ width: size, height: size }}>
        <SplitoMark size={size} tile />
      </View>
    );
  }

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="스플리토" style={{ width: size, height: size }}>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: size * MARK_TILE_RADIUS_RATIO,
          backgroundColor: '#FFFFFF',
          opacity: v.tile,
          transform: [{ scale: v.tile.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        }}
      />
      <Animated.View
        style={[
          layer,
          {
            opacity: v.s.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateX: v.s.interpolate({ inputRange: [0, 1], outputRange: [-5 * u, 0] }) },
              { translateY: v.s.interpolate({ inputRange: [0, 1], outputRange: [-7 * u, 0] }) },
              { rotate: v.s.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] }) },
              { scale: v.s.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
            ],
          },
        ]}
      >
        <SplitoMark size={size} layer="s" bleed />
      </Animated.View>
      <Animated.View
        style={[
          layer,
          {
            opacity: v.tri,
            transform: [
              { translateX: v.tri.interpolate({ inputRange: [0, 1], outputRange: [-14 * u, 0] }) },
              { translateX: v.goLoop.interpolate(scaled(track(GO_FRAMES, 'x'), u)) },
            ],
          },
        ]}
      >
        <SplitoMark size={size} layer="triangle" bleed />
      </Animated.View>
      <Animated.View
        style={[
          layer,
          {
            opacity: v.star,
            transform: [
              { rotate: v.star.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) },
              { scale: v.star.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
              { rotate: v.starLoop.interpolate(deg(TWINKLE_FRAMES, 'r')) },
              { scale: v.starLoop.interpolate(track(TWINKLE_FRAMES, 's')) },
            ],
          },
        ]}
      >
        <SplitoMark size={size} layer="star" bleed />
      </Animated.View>
      {(['miniA', 'miniB'] as const).map((k) => (
        <Animated.View
          key={k}
          style={[
            layer,
            {
              opacity: v[k].interpolate(track(MINI_FRAMES, 'o')),
              transform: [{ scale: v[k].interpolate(track(MINI_FRAMES, 's')) }],
            },
          ]}
        >
          <SplitoMark size={size} layer={k} bleed />
        </Animated.View>
      ))}
    </View>
  );
}

// viewBox 단위로 적힌 이동량을 px로 환산한다.
function scaled(t: { inputRange: number[]; outputRange: number[] }, u: number) {
  return { inputRange: t.inputRange, outputRange: t.outputRange.map((n) => n * u) };
}
