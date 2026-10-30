import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { NavArrowRight } from 'iconoir-react-native';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Checkbox } from '@/components/Checkbox';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { toUserError } from '@/lib/errors';
import { consentSchema, nicknameSchema } from '@/lib/profile';
import { signOut, updateConsent, updateNickname } from '@/services/auth';
import { colors } from '@/theme/tokens';

const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? 'splito-trip.vercel.app';
const ALL = ['terms', 'age14', 'overseas', 'marketing'] as const;
const schema = consentSchema.extend({ nickname: nicknameSchema });

// PRD §7.3 국외 이전 고지 요약. 전문은 처리방침.
const OVERSEAS = [
  'Anthropic(미국): 영수증 이미지, 인식할 텍스트 — 지출 인식 목적, 인식 후 보관하지 않음',
  'Supabase Inc.: 계정·장부 데이터(데이터는 서울 리전)',
  'Vercel(미국): 웹 랜딩',
  '이전 시기·방법: 서비스 이용 시 네트워크로 전송',
  '거부하면 가입할 수 없어요. 가입 후 AI 인식 대신 직접 입력할 수 있어요',
];

function Row({ children, onMore, moreLabel }: { children: ReactNode; onMore?: () => void; moreLabel?: string }) {
  return (
    <View className="flex-row items-center gap-2 px-3 py-0.5">
      {children}
      {onMore && (
        <Pressable accessibilityRole="button" accessibilityLabel={moreLabel} onPress={onMore} hitSlop={8} className="p-1">
          <Icon as={NavArrowRight} size={18} color={colors.ink[300]} />
        </Pressable>
      )}
    </View>
  );
}

// 가입: 닉네임 확인 + 약관 동의를 한 화면에서 한다. 저장 후 '/'로 보내면 resolveEntryRoute가 다음 화면을 고른다.
export default function Consent() {
  const { profile, refreshProfile } = useAuth();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  const { control, setValue, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { marketing: false, nickname: profile?.nickname ?? '' }, // SNS 닉네임이 미리 채워져 있다
  });
  const v = useWatch({ control });
  const all = ALL.every((k) => v[k] === true);
  const set = (key: (typeof ALL)[number], checked: boolean) => setValue(key, checked as true, { shouldValidate: true });

  const submit = handleSubmit(async ({ nickname, ...consent }) => {
    setError(undefined);
    try {
      await updateConsent(consent);
      await updateNickname(nickname);
      await refreshProfile();
      router.replace('/');
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
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar onBack={decline} />
      <ScrollView contentContainerClassName="gap-7 px-5 pt-2" contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View className="gap-1.5">
          <Text style={{ letterSpacing: -0.52 }} className="font-bold text-[26px] leading-[34px] text-ink">
            거의 다 왔어요
          </Text>
          <Text className="text-[15px] text-ink-500">닉네임을 확인하고 약관에 동의해주세요</Text>
        </View>

        <View className="gap-2">
          <Text className="font-semibold text-[13px] text-ink-500">닉네임</Text>
          <Controller
            control={control}
            name="nickname"
            render={({ field, fieldState }) => (
              <TextField
                accessibilityLabel="닉네임"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                maxLength={12}
                placeholder="1~12자"
                invalid={!!fieldState.error && fieldState.isDirty}
                right={<Text className="font-medium text-[13px] text-ink-400">{`${field.value.length}/12`}</Text>}
              />
            )}
          />
        </View>

        <View className="rounded-[18px] bg-app p-1.5">
          <View className="rounded-input bg-white px-3 py-1.5" style={{ boxShadow: '0 2px 4px -2px rgba(19,25,39,.08)' }}>
            <Checkbox label="전체 동의하기" round bold checked={all} onChange={(c) => ALL.forEach((k) => set(k, c))} />
          </View>
          <Row moreLabel="서비스 이용약관 보기" onMore={() => Linking.openURL(`https://${LINK_DOMAIN}/terms`)}>
            <Checkbox label="서비스 이용약관" tag="필수" checked={v.terms === true} onChange={(c) => set('terms', c)} />
          </Row>
          <Row>
            <Checkbox label="만 14세 이상이에요" tag="필수" checked={v.age14 === true} onChange={(c) => set('age14', c)} />
          </Row>
          <Row moreLabel={open ? '국외 이전 고지 접기' : '국외 이전 고지 자세히'} onMore={() => setOpen(!open)}>
            <Checkbox label="개인정보 국외 이전 고지 확인" tag="필수" checked={v.overseas === true} onChange={(c) => set('overseas', c)} />
          </Row>
          {open && (
            <View className="gap-1 px-3 pb-2 pl-11">
              {OVERSEAS.map((line) => (
                <Text key={line} className="text-[13px] leading-[19px] text-ink-500">
                  · {line}
                </Text>
              ))}
              <Pressable accessibilityRole="link" className="h-9 justify-center" onPress={() => Linking.openURL(`https://${LINK_DOMAIN}/privacy`)}>
                <Text className="font-semibold text-[13px] text-primary-text">개인정보 처리방침 전문 보기</Text>
              </Pressable>
            </View>
          )}
          <Row>
            <Checkbox label="마케팅 정보 수신" tag="선택" checked={v.marketing === true} onChange={(c) => set('marketing', c)} />
          </Row>
        </View>

        <Text className="text-[13px] leading-[19px] text-ink-400">
          영수증 이미지는 AI 인식을 위해 Anthropic(미국)으로 전송돼요. 받을 계좌는 나중에 등록해도 돼요.
        </Text>
      </ScrollView>
      <BottomBar>
        {error && <Text className="text-[13px] text-danger">{error}</Text>}
        <PrimaryButton title="시작하기" disabled={!formState.isValid} loading={formState.isSubmitting} onPress={submit} />
      </BottomBar>
    </SafeAreaView>
  );
}
