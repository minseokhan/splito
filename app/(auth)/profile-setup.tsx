import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { toUserError } from '@/lib/errors';
import { nicknameSchema } from '@/lib/profile';
import { updateNickname } from '@/services/auth';

const schema = z.object({ nickname: nicknameSchema });

export default function ProfileSetup() {
  const { profile, refreshProfile } = useAuth();
  const [error, setError] = useState<string>();
  const [focused, setFocused] = useState(false);
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
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-1 gap-2 pt-6">
        <Text className="mb-4 font-bold text-[22px] text-ink-900">닉네임을 확인해 주세요</Text>
        <Controller
          control={control}
          name="nickname"
          render={({ field }) => (
            <TextInput
              accessibilityLabel="닉네임"
              value={field.value}
              onChangeText={field.onChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={12}
              placeholder="1~12자"
              className={`h-12 rounded-lg border px-4 text-base text-ink-900 ${
                invalid ? 'border-minus' : focused ? 'border-sky-800 bg-sky-100' : 'border-input-line bg-white'
              }`}
            />
          )}
        />
        {invalid && <Text className="text-sm text-minus">닉네임은 1~12자로 입력해 주세요</Text>}
        <Text className="text-[13px] text-ink-500">받을 계좌는 나중에 등록할 수 있어요</Text>
      </View>
      <View className="gap-2 pb-4">
        {error && <Text className="text-[13px] text-minus">{error}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={submitTo('/payout-account')}
          className={`h-14 items-center justify-center rounded-xl bg-sky-200 ${disabled ? 'opacity-40' : ''}`}
        >
          <Text className="font-semibold text-base text-ink-900">받을 계좌 등록(선택)</Text>
        </Pressable>
        <PrimaryButton title="시작하기" disabled={disabled} onPress={submitTo('/')} />
      </View>
    </SafeAreaView>
  );
}
