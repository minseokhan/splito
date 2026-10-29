import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InvitePasteBox } from '@/components/InvitePasteBox';
import { toUserError } from '@/lib/errors';
import { signInWithKakao } from '@/services/auth';

export default function Login() {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const kakao = async () => {
    setError(undefined);
    setBusy(true);
    try {
      await signInWithKakao();
      router.replace('/');
    } catch (e) {
      setError(toUserError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-1 justify-center">
        <Text className="font-bold text-[22px] text-ink-900">스플리토</Text>
        <Text className="mt-2 text-[15px] text-ink-700">누가 결제했든, 올리면 한 번에 정산돼요</Text>
      </View>
      <View className="gap-2 pb-4">
        {error && <Text className="text-[13px] text-minus">{error}</Text>}
        {/* 카카오 브랜드 가이드: #FEE500 배경, 검정 85% 글자. 하늘색으로 바꾸지 않는다. */}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={kakao}
          className={`h-[52px] items-center justify-center rounded-xl bg-[#FEE500] ${busy ? 'opacity-40' : ''}`}
        >
          <Text className="font-semibold text-base text-black/85">카카오 로그인</Text>
        </Pressable>
        {/* 앱 미설치 → 설치 후 첫 실행: 저장된 초대는 로그인 뒤 resolveEntryRoute의 join 분기가 처리한다. */}
        <View className="pt-6">
          <InvitePasteBox />
        </View>
      </View>
    </SafeAreaView>
  );
}
