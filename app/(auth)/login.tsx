import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedSplitoMark } from '@/components/AnimatedMark';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { InvitePasteBox } from '@/components/InvitePasteBox';
import { KakaoSymbol, Wordmark } from '@/components/Logo';
import { toUserError } from '@/lib/errors';
import { signInAsTestUser, signInWithProvider, TEST_USERS } from '@/services/auth';
import { colors } from '@/theme/tokens';

// 핸드오프 splito-landing-preview.html 의 `.rise` 와 `.d1`~`.d6` 값 그대로다.
// .rise{opacity:0;transform:translateY(12px);animation:rise .6s cubic-bezier(.22,1,.36,1) forwards}
const RISE = { y: 12, duration: 600, easing: [0.22, 1, 0.36, 1] } as const;
const RISE_DELAY = { kicker: 1350, wordmark: 1500, desc: 1650, kakao: 1850, naver: 1950, terms: 2050 } as const;

// 마크 애니메이션(AnimatedSplitoMark)이 끝나는 1.35초부터 아래에서 순서대로 떠오른다.
// reduced가 undefined인 동안은 opacity 0이다. 완성 상태를 먼저 그렸다가 0으로 되돌리면 깜빡인다.
function Rise({ delay, reduced, children }: { delay: number; reduced: boolean | undefined; children: ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced === undefined) return;
    if (reduced) {
      v.setValue(1);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: RISE.duration, easing: Easing.bezier(...RISE.easing), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [delay, reduced, v]);

  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [RISE.y, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// 브랜드 가이드 색(카카오 #FEE500/#191600, 네이버 #03C75A/흰색). 하늘색으로 바꾸지 않는다.
function SnsButton({ label, icon, box, text, busy, onPress }: { label: string; icon: ReactNode; box: string; text: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      className={`h-14 flex-row items-center justify-center gap-2 rounded-button active:translate-y-px ${box}`}
    >
      {busy ? <ActivityIndicator color={text === 'text-white' ? '#FFFFFF' : colors.kakao.text} /> : icon}
      <Text className={`font-semibold text-[17px] ${text}`}>{label}</Text>
    </Pressable>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reduced, setReduced] = useState<boolean>();

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () => setReduced(false));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError(undefined);
    setBusy(true);
    try {
      await fn();
      router.replace('/');
    } catch (e) {
      setError(toUserError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const signIn = (provider: 'kakao' | 'custom:naver') => run(() => signInWithProvider(provider));

  return (
    <View className="flex-1 bg-white">
      {/* 랜딩 전용. sky-100(#E8EEF8)과 다른 값이며 확정 캡처 01-login.png 픽셀 실측으로 #E8F4FF다
          (프로토타입 1a is.login 블록도 같은 값). 랜딩에서만 쓰여 토큰을 만들지 않았다. */}
      <View className="flex-1 items-center justify-center gap-5 rounded-b-[40px]" style={{ backgroundColor: '#E8F4FF', paddingTop: insets.top + 40 }}>
        {/* 시안의 둥근 앱 아이콘 132px. 그림자는 아이콘 밖에 깔아야 하므로 래퍼에 둔다. */}
        <View className="rounded-[30px]" style={{ boxShadow: '0 10px 28px -6px rgba(29,60,143,.28)' }}>
          <AnimatedSplitoMark size={132} />
        </View>
        <View className="items-center gap-3 px-8 pb-10">
          {/* #0E2A47은 바로 아래 워드마크(Logo.tsx)와 같은 값이라 토큰 ink(#0E1B3D)를 쓰지 않는다. */}
          <Rise delay={RISE_DELAY.kicker} reduced={reduced}>
            <Text className="text-center font-semibold text-lg text-[#0E2A47]">동행과 함께 쓰는 AI 정산 서비스</Text>
          </Rise>
          {/* 시안 글자 높이 48pt 실측(캡처 01-login.png). Wordmark의 size는 viewBox 높이다. */}
          <Rise delay={RISE_DELAY.wordmark} reduced={reduced}>
            <Wordmark size={48} />
          </Rise>
          {/* leading-6: 시안 2줄 간격 25pt에 맞춘다(RN 기본값은 16px 글자에 약 19pt라 더 붙는다). */}
          <Rise delay={RISE_DELAY.desc} reduced={reduced}>
            <Text className="mt-1 text-center text-base leading-6 text-tagline">
              자유 여행, 패키지 상관없이{'\n'}지출 관리와 정산을 한 곳에서
            </Text>
          </Rise>
        </View>
      </View>
      <View className="gap-2.5 px-5 pt-7" style={{ paddingBottom: Math.max(insets.bottom + 10, 44) }}>
        {error && <Text className="text-center text-[13px] text-danger">{error}</Text>}
        <Rise delay={RISE_DELAY.kakao} reduced={reduced}>
          <SnsButton
            label="카카오로 시작하기"
            icon={<Icon as={KakaoSymbol} size={20} color={colors.kakao.text} />}
            box="bg-kakao active:bg-[#F2DA00]"
            text="text-kakao-text"
            busy={busy}
            onPress={() => signIn('kakao')}
          />
        </Rise>
        <Rise delay={RISE_DELAY.naver} reduced={reduced}>
          <SnsButton
            label="네이버로 시작하기"
            icon={<Text className="font-semibold text-lg text-white">N</Text>}
            box="bg-naver active:bg-[#02B350]"
            text="text-white"
            busy={busy}
            onPress={() => signIn('custom:naver')}
          />
        </Rise>
        <Rise delay={RISE_DELAY.terms} reduced={reduced}>
          <Text className="mt-1.5 text-center text-xs text-ink-400">가입 시 이용약관 및 개인정보 처리방침에 동의하게 돼요</Text>
        </Rise>
        {/* 앱 미설치 → 설치 후 첫 실행: 저장된 초대는 로그인 뒤 resolveEntryRoute의 join 분기가 처리한다. */}
        <Pressable accessibilityRole="button" onPress={() => setInviteOpen(true)} hitSlop={8} className="self-center py-1">
          <Text className="font-semibold text-[13px] text-primary-text">초대 링크를 받으셨나요?</Text>
        </Pressable>
        {/* dev 빌드 전용: 다른 참여자 화면을 확인하기 위한 테스트 계정 로그인. 릴리스 번들에서는 사라진다. */}
        {__DEV__ && (
          <View className="flex-row justify-center gap-4 pt-1">
            {TEST_USERS.map((u) => (
              <Pressable key={u.email} accessibilityRole="button" disabled={busy} hitSlop={8} onPress={() => run(() => signInAsTestUser(u.email))}>
                <Text className="text-xs text-ink-400 underline">DEV: {u.nickname}로 로그인</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <BottomSheet visible={inviteOpen} onClose={() => setInviteOpen(false)}>
        <InvitePasteBox />
      </BottomSheet>
    </View>
  );
}
