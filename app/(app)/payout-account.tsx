import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { BottomSheet } from '@/components/BottomSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useMyPayoutAccount, useSetPayoutAccount } from '@/hooks/usePayoutAccount';
import { BANKS, accountNumberSchema } from '@/lib/bank';
import { toUserError } from '@/lib/errors';

// 계좌번호는 폼 상태에만 둔다. AsyncStorage·draft·로그에 남기지 않는다(PRD §7.3).
const schema = z.object({
  bankCode: z.string().min(1),
  holderName: z.string().trim().min(1).max(20),
  accountNumber: accountNumberSchema,
});

const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function PayoutAccountScreen() {
  const { data: current, isLoading } = useMyPayoutAccount();
  const save = useSetPayoutAccount();
  const [editing, setEditing] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [error, setError] = useState<string>();
  const { control, handleSubmit, formState, reset, setValue } = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { bankCode: '', holderName: '', accountNumber: '' },
  });
  // 등록돼 있으면 은행·예금주만 채운다. 계좌번호 원문은 읽지 않으므로 다시 입력받는다.
  useEffect(() => {
    if (current) reset({ bankCode: current.bankCode, holderName: current.holderName, accountNumber: '' });
  }, [current, reset]);
  const bankCode = useWatch({ control, name: 'bankCode' });
  const bank = BANKS.find((b) => b.code === bankCode);

  const submit = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await save.mutateAsync({ bankCode: v.bankCode, bankName: bank?.name ?? '', holderName: v.holderName, accountNumber: v.accountNumber });
      done();
    } catch (e) {
      setError(toUserError(e).message);
    }
  });

  if (isLoading) return null;
  const showForm = !current || editing;

  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <ScrollView contentContainerClassName="gap-2 pt-6" keyboardShouldPersistTaps="handled">
        <Text className="mb-2 font-bold text-[22px] text-ink-900">받을 계좌</Text>
        <Text className="mb-4 text-[13px] text-ink-500">정산에서 나에게 줄 돈이 있는 분에게만 계좌번호가 보여요</Text>
        {current && (
          <View className="mb-4 rounded-lg border border-line px-4 py-3">
            <Text className="font-semibold text-base text-ink-900">{current.bankName}</Text>
            <Text className="text-[15px] text-ink-700">
              ****-**-***{current.accountLast4} · {current.holderName}
            </Text>
          </View>
        )}
        {showForm ? (
          <>
            <Text className="text-[13px] text-ink-500">은행</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="은행 선택"
              onPress={() => setBankOpen(true)}
              className="h-12 justify-center rounded-lg border border-input-line px-4"
            >
              <Text className={`text-base ${bank ? 'text-ink-900' : 'text-ink-500'}`}>{bank?.name ?? '은행을 골라주세요'}</Text>
            </Pressable>
            <Text className="mt-2 text-[13px] text-ink-500">예금주</Text>
            <Controller
              control={control}
              name="holderName"
              render={({ field }) => (
                <TextInput
                  accessibilityLabel="예금주"
                  value={field.value}
                  onChangeText={field.onChange}
                  maxLength={20}
                  className="h-12 rounded-lg border border-input-line px-4 text-base text-ink-900"
                />
              )}
            />
            <Text className="mt-2 text-[13px] text-ink-500">계좌번호</Text>
            <Controller
              control={control}
              name="accountNumber"
              render={({ field, fieldState }) => {
                const invalid = !!fieldState.error && field.value !== '';
                return (
                  <>
                    <TextInput
                      accessibilityLabel="계좌번호"
                      value={field.value}
                      onChangeText={field.onChange}
                      keyboardType="number-pad"
                      autoComplete="off"
                      maxLength={30}
                      placeholder="숫자만 입력해도 돼요"
                      className={`h-12 rounded-lg border px-4 text-base text-ink-900 ${invalid ? 'border-minus' : 'border-input-line'}`}
                    />
                    {invalid && <Text className="text-sm text-minus">계좌번호는 숫자 8~20자리로 입력해 주세요</Text>}
                  </>
                );
              }}
            />
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setEditing(true)} className="h-11 justify-center">
            <Text className="font-medium text-sky-900">계좌 수정하기</Text>
          </Pressable>
        )}
      </ScrollView>
      <View className="gap-2 pb-4">
        {error && <Text className="text-[13px] text-minus">{error}</Text>}
        {showForm ? (
          <PrimaryButton title="저장" disabled={!formState.isValid || formState.isSubmitting} onPress={submit} />
        ) : (
          <PrimaryButton title="확인" onPress={done} />
        )}
      </View>
      <BottomSheet visible={bankOpen} onClose={() => setBankOpen(false)}>
        <ScrollView className="max-h-96">
          {BANKS.map((b) => (
            <Pressable
              key={b.code}
              accessibilityRole="button"
              onPress={() => {
                setValue('bankCode', b.code, { shouldValidate: true });
                setBankOpen(false);
              }}
              className="h-12 justify-center"
            >
              <Text className="text-base text-ink-900">{b.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}
