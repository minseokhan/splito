import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { requireOptionalNativeModule } from 'expo';
import { useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { KakaoSymbol } from '@/components/Logo';
import { toUserError } from '@/lib/errors';
import { signInAsTestUser, signInWithProvider, TEST_USERS } from '@/services/auth';
import { colors } from '@/theme/tokens';

// 클로드 디자인 1a 로그인 화면. 이미지는 캔버스 assets/brand/splito_*_only.png를 3배로 줄인 것이다.
const SYMBOL = require('../../assets/images/login-symbol.png');
const WORDMARK = require('../../assets/images/login-wordmark.png');
const WM_H = 44;
const WM_W = (WM_H * 302) / 132;
// 시안은 워드마크를 흰색으로 칠하고 i 위 별만 원본색으로 다시 겹친다(clip-path: inset(0 35.3% 68.4% 50.9%)).
// 하단 패널 흐림(backdrop blur 16px). expo-blur는 네이티브 모듈이라, 넣기 전에 빌드한 dev client에는 없다 —
// 그때는 흐림 없이 반투명 흰색만 깐다. ponytail: 모든 기기가 새 빌드로 바뀌면 분기를 지우고 바로 import한다.
const Blur: ComponentType<ViewProps & { intensity: number; tint: 'light' }> | null = requireOptionalNativeModule('ExpoBlur')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-blur').BlurView
  : null;

const STAR_CLIP = { left: WM_W * 0.509, width: WM_W * (1 - 0.509 - 0.353), height: WM_H * (1 - 0.684) };

// 배경: 네이비 세로 그라데이션 + 빛 번짐 2개(시안 390pt 기준 좌표, 오른쪽 위는 화면 폭에 붙인다).
function Backdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg width={width} height={height} style={{ position: 'absolute' }} pointerEvents="none">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.login.from} />
          <Stop offset="1" stopColor={colors.login.to} />
        </LinearGradient>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.login.glow} stopOpacity={0.45} />
          <Stop offset="0.7" stopColor={colors.login.glow} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glowMint" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.login['glow-mint']} stopOpacity={0.22} />
          <Stop offset="0.7" stopColor={colors.login['glow-mint']} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#bg)" />
      <Circle cx={width - 50} cy={60} r={140} fill="url(#glow)" />
      <Circle cx={30} cy={440} r={140} fill="url(#glowMint)" />
    </Svg>
  );
}

// 브랜드 가이드 색(카카오 #FEE500/#191600, 네이버 #03C75A/흰색). 하늘색으로 바꾸지 않는다.
function SnsButton({ label, box, spinner, busy, disabled, onPress, children }: { label: string; box: string; spinner: string; busy: boolean; disabled: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      className={`h-16 w-16 items-center justify-center rounded-full active:scale-95 ${box}`}
      style={{ boxShadow: '0 4px 12px -6px rgba(23,32,58,.25)' }}
    >
      {busy ? <ActivityIndicator color={spinner} /> : children}
    </Pressable>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string>();
  // 누른 버튼만 스피너를 돌린다. 나머지는 끝날 때까지 눌리지 않게만 막는다.
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(undefined);
    setBusy(key);
    try {
      await fn();
      router.replace('/');
    } catch (e) {
      setError(toUserError(e).message);
    } finally {
      setBusy(null);
    }
  };

  const signIn = (provider: 'kakao' | 'custom:naver') => run(provider, () => signInWithProvider(provider));

  return (
    <View className="flex-1 bg-login-to">
      <StatusBar style="light" />
      <Backdrop />
      <View className="flex-1 items-center justify-center px-8" style={{ paddingTop: insets.top + 6, paddingBottom: 56 }}>
        <View className="h-24 w-24 items-center justify-center rounded-[28px] bg-white" style={{ boxShadow: '0 16px 40px -12px rgba(0,0,0,.45)' }}>
          <Image source={SYMBOL} style={{ width: 56, height: 64 }} resizeMode="contain" />
        </View>
        <View className="mt-7" accessible accessibilityRole="header" accessibilityLabel="Splito" style={{ width: WM_W, height: WM_H }}>
          <Image source={WORDMARK} style={{ width: WM_W, height: WM_H, tintColor: colors.primary.on }} />
          <View className="absolute top-0 overflow-hidden" style={STAR_CLIP}>
            <Image source={WORDMARK} style={{ width: WM_W, height: WM_H, marginLeft: -STAR_CLIP.left }} />
          </View>
        </View>
        <Text className="mt-[18px] text-center font-semibold text-22 leading-8 text-white">
          여행 지출은 쉽게,{'\n'}정산은 똑똑하게
        </Text>
      </View>
      <View className="-mt-7 rounded-t-[28px]" style={{ boxShadow: '0 -12px 32px -16px rgba(0,0,0,.35)' }}>
        <View
          className="items-center gap-5 overflow-hidden rounded-t-[28px] border-t border-white/60 px-6 pt-8"
          style={{ paddingBottom: Math.max(insets.bottom + 30, 64) }}
        >
          {Blur && <Blur intensity={40} tint="light" style={StyleSheet.absoluteFill} />}
          <View className="absolute inset-0 bg-white/[.88]" />
          <Text className="text-center text-sm text-ink-500">SNS 계정으로 시작하기</Text>
          {error && <Text className="text-center text-13 text-danger">{error}</Text>}
          <View className="flex-row gap-5">
            <SnsButton label="카카오로 시작하기" box="bg-kakao" spinner={colors.kakao.text} busy={busy === 'kakao'} disabled={!!busy} onPress={() => signIn('kakao')}>
              <KakaoSymbol width={28} />
            </SnsButton>
            <SnsButton label="네이버로 시작하기" box="bg-naver" spinner={colors.primary.on} busy={busy === 'custom:naver'} disabled={!!busy} onPress={() => signIn('custom:naver')}>
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path d="M16.3 12.8 7.4 0H0v24h7.7V11.2L16.6 24H24V0h-7.7z" fill={colors.primary.on} />
              </Svg>
            </SnsButton>
            {/* Apple 로그인은 아직 없다(무료 개발자 계정은 Sign in with Apple 권한을 못 쓴다). 버튼만 둔다. */}
            <SnsButton label="Apple로 시작하기" box="bg-apple" spinner={colors.primary.on} busy={false} disabled={!!busy} onPress={() => setError('Apple 로그인은 준비 중이에요')}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path
                  d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                  fill={colors.primary.on}
                />
              </Svg>
            </SnsButton>
          </View>
          <Text className="text-center text-xs text-ink-300">계속하면 이용약관 및 개인정보처리방침에 동의하게 됩니다.</Text>
          {/* dev 빌드 전용: 다른 참여자 화면을 확인하기 위한 테스트 계정 로그인. 릴리스 번들에서는 사라진다. */}
          {__DEV__ && (
            <View className="flex-row justify-center gap-4">
              {TEST_USERS.map((u) => (
                <Pressable key={u.email} accessibilityRole="button" disabled={!!busy} hitSlop={8} onPress={() => run(u.email, () => signInAsTestUser(u.email))}>
                  <Text className="text-xs text-ink-400 underline">DEV: {u.nickname}로 로그인</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
