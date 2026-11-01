import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { toUserError } from '@/lib/errors';
import { nicknameSchema } from '@/lib/profile';
import { updateNickname } from '@/services/auth';

const schema = z.object({ nickname: nicknameSchema });

// 예외 경로: 동의는 했지만 닉네임이 비어 있을 때(resolveEntryRoute). 보통은 가입 화면에서 함께 저장한다.
export default function ProfileSetup() {
  const { profile, refreshProfile } = useAuth();
  const [error, setError] = useState<string>();
  const { control, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { nickname: profile?.nickname ?? '' }, // SNS 닉네임이 미리 채워져 있다
  });
  const invalid = !!formState.errors.nickname;

  // 계좌 등록은 선택이다. [시작하기]가 '나중에'다.
  const submitTo = (next: '/' | '/payout-account') =>
    handleSubmit(async ({ nickname }) => {
      try {
        await updateNickname(nickname);
        await refreshProfile();
        router.replace(next);
      } catch (e) {
        setError(toUserError(e).message);
      }
    });
  const disabled = !formState.isValid || formState.isSubmitting;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <View className="flex-1 gap-7 px-5 pt-[60px]">
        <View className="gap-1.5">
          <Text className="font-semibold text-2xl text-ink">닉네임을 확인해 주세요</Text>
          <Text className="text-base text-ink-500">받을 계좌는 나중에 등록할 수 있어요</Text>
        </View>
        <View className="gap-2">
          <Text className="font-semibold text-[13px] text-ink-500">닉네임</Text>
          <Controller
            control={control}
            name="nickname"
            render={({ field }) => (
              <TextField
                accessibilityLabel="닉네임"
                value={field.value}
                onChangeText={field.onChange}
                maxLength={12}
                placeholder="1~12자"
                invalid={invalid}
                right={<Text className="font-medium text-[13px] text-ink-400">{`${field.value.length}/12`}</Text>}
              />
            )}
          />
          {invalid && <Text className="text-[13px] text-danger">닉네임은 1~12자로 입력해 주세요</Text>}
        </View>
      </View>
      <BottomBar>
        {error && <Text className="text-[13px] text-danger">{error}</Text>}
        <PrimaryButton title="받을 계좌 등록(선택)" variant="sky" disabled={disabled} onPress={submitTo('/payout-account')} />
        <PrimaryButton title="시작하기" disabled={disabled} onPress={submitTo('/')} />
      </BottomBar>
    </SafeAreaView>
  );
}
