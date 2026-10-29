import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Checkbox } from '@/components/Checkbox';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { toUserError } from '@/lib/errors';
import { consentSchema } from '@/lib/profile';
import { signOut, updateConsent } from '@/services/auth';

const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? 'splito.vercel.app';
const REQUIRED = ['terms', 'age14', 'overseas'] as const;

// PRD §7.3 국외 이전 고지 요약. 전문은 처리방침.
const OVERSEAS = [
  'Anthropic(미국): 영수증 이미지, 인식할 텍스트 — 지출 인식 목적, 인식 후 보관하지 않음',
  'Supabase Inc.: 계정·장부 데이터(데이터는 서울 리전)',
  'Vercel(미국): 웹 랜딩',
  '이전 시기·방법: 서비스 이용 시 네트워크로 전송',
  '거부하면 가입할 수 없어요. 가입 후 AI 인식 대신 직접 입력할 수 있어요',
];

export default function Consent() {
  const { refreshProfile } = useAuth();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  const { control, setValue, handleSubmit, formState } = useForm({
    resolver: zodResolver(consentSchema),
    mode: 'onChange',
    defaultValues: { marketing: false },
  });
  const v = useWatch({ control });
  const allRequired = REQUIRED.every((k) => v[k] === true);
  const set = (key: keyof typeof v, checked: boolean) => setValue(key, checked as true, { shouldValidate: true });

  const submit = handleSubmit(async (input) => {
    try {
      await updateConsent(input);
      await refreshProfile();
      router.replace('/(auth)/profile-setup');
    } catch (e) {
      setError(toUserError(e).message);
    }
  });

  // 거부: 로그아웃만 한다. 대기 중인 초대(pending_invite)는 지우지 않는다(24시간 보존).
  const decline = async () => {
    await signOut().catch(() => undefined);
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-5 pt-6 gap-6">
        <Text className="font-bold text-[22px] text-ink-900">약관에 동의해 주세요</Text>
        <View className="gap-2">
          <Checkbox label="필수 전체 동의" bold checked={allRequired} onChange={(c) => REQUIRED.forEach((k) => set(k, c))} />
          <View className="h-px bg-divider" />
          <View className="flex-row items-center">
            <Checkbox label="서비스 이용약관 동의(필수)" checked={v.terms === true} onChange={(c) => set('terms', c)} />
            <Pressable className="h-11 justify-center px-2" onPress={() => Linking.openURL(`https://${LINK_DOMAIN}/terms`)}>
              <Text className="font-medium text-sky-900">보기</Text>
            </Pressable>
          </View>
          <Checkbox label="만 14세 이상이에요(필수)" checked={v.age14 === true} onChange={(c) => set('age14', c)} />
          <View className="flex-row items-center">
            <Checkbox
              label="개인정보 국외 이전 고지를 확인했어요(필수)"
              checked={v.overseas === true}
              onChange={(c) => set('overseas', c)}
            />
            <Pressable className="h-11 justify-center px-2" onPress={() => setOpen(!open)}>
              <Text className="font-medium text-sky-900">{open ? '접기' : '자세히'}</Text>
            </Pressable>
          </View>
          {open && (
            <View className="gap-1 rounded-lg bg-sky-100 p-3">
              {OVERSEAS.map((line) => (
                <Text key={line} className="text-[13px] text-ink-500">
                  · {line}
                </Text>
              ))}
              <Pressable className="h-11 justify-center" onPress={() => Linking.openURL(`https://${LINK_DOMAIN}/privacy`)}>
                <Text className="font-medium text-sky-900">개인정보 처리방침 전문 보기</Text>
              </Pressable>
            </View>
          )}
          <Checkbox label="마케팅 정보 수신 동의(선택)" checked={v.marketing === true} onChange={(c) => set('marketing', c)} />
        </View>
      </ScrollView>
      <View className="gap-2 px-5 pb-4">
        {!formState.isValid && <Text className="text-[13px] text-ink-500">필수 항목에 모두 동의해야 시작할 수 있어요</Text>}
        {error && <Text className="text-[13px] text-minus">{error}</Text>}
        <PrimaryButton title="동의하고 계속하기" disabled={!formState.isValid || formState.isSubmitting} onPress={submit} />
        <Pressable className="h-11 items-center justify-center" onPress={decline}>
          <Text className="font-medium text-sky-900">동의하지 않아요</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
