import { router } from 'expo-router';
import { ChatBubble } from 'iconoir-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { InvitePasteBox } from '@/components/InvitePasteBox';
import { SplitoSymbol, Wordmark } from '@/components/Logo';
import { toUserError } from '@/lib/errors';
import { signInWithProvider } from '@/services/auth';
import { colors } from '@/theme/tokens';

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
      <Text className={`font-bold text-[17px] ${text}`}>{label}</Text>
    </Pressable>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const signIn = async (provider: 'kakao' | 'custom:naver') => {
    setError(undefined);
    setBusy(true);
    try {
      await signInWithProvider(provider);
      router.replace('/');
    } catch (e) {
      setError(toUserError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center gap-5 rounded-b-[40px] bg-sky-100" style={{ paddingTop: insets.top + 40 }}>
        <View
          className="h-[150px] w-[150px] items-center justify-center rounded-full bg-white"
          style={{ boxShadow: '0 10px 32px -4px rgba(8,116,187,.18)' }}
        >
          <SplitoSymbol size={118} blush />
        </View>
        <Wordmark size={44} />
        <View className="items-center gap-1.5 px-8 pb-10">
          <Text style={{ letterSpacing: -0.44 }} className="text-center font-bold text-[22px] text-ink">
            누가 냈든, 한 번에 정산
          </Text>
          <Text className="text-center text-[15px] leading-[22px] text-ink-500">
            {'영수증 사진·카드 문자·말 한마디로 올리면\n최소 송금으로 정리해드려요'}
          </Text>
        </View>
      </View>
      <View className="gap-2.5 px-5 pt-7" style={{ paddingBottom: Math.max(insets.bottom + 10, 44) }}>
        {error && <Text className="text-center text-[13px] text-danger">{error}</Text>}
        <SnsButton
          label="카카오로 시작하기"
          icon={<Icon as={ChatBubble} size={20} color={colors.kakao.text} />}
          box="bg-kakao active:bg-[#F2DA00]"
          text="text-kakao-text"
          busy={busy}
          onPress={() => signIn('kakao')}
        />
        <SnsButton
          label="네이버로 시작하기"
          icon={<Text className="font-extrabold text-lg text-white">N</Text>}
          box="bg-naver active:bg-[#02B350]"
          text="text-white"
          busy={busy}
          onPress={() => signIn('custom:naver')}
        />
        <Text className="mt-1.5 text-center text-xs text-ink-400">가입 시 이용약관 및 개인정보 처리방침에 동의하게 돼요</Text>
        {/* 앱 미설치 → 설치 후 첫 실행: 저장된 초대는 로그인 뒤 resolveEntryRoute의 join 분기가 처리한다. */}
        <Pressable accessibilityRole="button" onPress={() => setInviteOpen(true)} hitSlop={8} className="self-center py-1">
          <Text className="font-semibold text-[13px] text-primary-text">초대 링크를 받으셨나요?</Text>
        </Pressable>
      </View>
      <BottomSheet visible={inviteOpen} onClose={() => setInviteOpen(false)}>
        <InvitePasteBox />
      </BottomSheet>
    </View>
  );
}
