import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { PrimaryButton } from '@/components/PrimaryButton';
import { useCreateRoom } from '@/hooks/useRooms';
import { CURRENCIES, isCurrencyCode } from '@/lib/currency';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)))
  .or(z.literal(''));

const schema = z
  .object({
    name: z.string().trim().min(1).max(30),
    baseCurrency: z.string().refine(isCurrencyCode),
    startDate: date,
    endDate: date,
  })
  .refine((v) => !v.endDate || (!!v.startDate && v.endDate >= v.startDate), { path: ['endDate'] });

const inputCls = (invalid: boolean) =>
  `h-12 rounded-lg border bg-white px-4 text-base text-ink-900 ${invalid ? 'border-minus' : 'border-input-line'}`;

export default function NewRoom() {
  const create = useCreateRoom();
  const [error, setError] = useState<string>();
  const { control, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { name: '', baseCurrency: 'KRW', startDate: '', endDate: '' },
  });
  const errs = formState.errors;

  const submit = handleSubmit(async (v) => {
    try {
      const roomId = await create.mutateAsync({
        name: v.name.trim(),
        baseCurrency: v.baseCurrency,
        startDate: v.startDate || undefined,
        endDate: v.endDate || undefined,
      });
      router.replace({ pathname: '/rooms/[roomId]', params: { roomId } });
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-2 px-5 pt-6" keyboardShouldPersistTaps="handled">
        <Text className="mb-4 font-bold text-[22px] text-ink-900">여행 만들기</Text>

        <Text className="font-semibold text-[15px] text-ink-900">이름</Text>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <TextInput
              accessibilityLabel="여행 이름"
              value={field.value}
              onChangeText={field.onChange}
              maxLength={30}
              placeholder="오사카 3박4일"
              className={inputCls(!!errs.name)}
            />
          )}
        />

        <Text className="mt-4 font-semibold text-[15px] text-ink-900">기본 통화</Text>
        <Controller
          control={control}
          name="baseCurrency"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-2">
              {CURRENCIES.map((c) => {
                const selected = field.value === c.code;
                return (
                  <Pressable
                    key={c.code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={c.label}
                    onPress={() => field.onChange(c.code)}
                    className={`h-11 justify-center rounded-md px-3 ${selected ? 'bg-sky-300' : 'bg-sky-100'}`}
                  >
                    <Text className="font-semibold text-[13px] text-ink-900">
                      {c.code} {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        />

        <Text className="mt-4 font-semibold text-[15px] text-ink-900">기간 (선택)</Text>
        <View className="flex-row items-center gap-2">
          {(['startDate', 'endDate'] as const).map((n) => (
            <Controller
              key={n}
              control={control}
              name={n}
              render={({ field }) => (
                <TextInput
                  accessibilityLabel={n === 'startDate' ? '시작일' : '종료일'}
                  value={field.value}
                  onChangeText={field.onChange}
                  maxLength={10}
                  keyboardType="numbers-and-punctuation"
                  placeholder="YYYY-MM-DD"
                  className={`flex-1 ${inputCls(!!errs[n])}`}
                />
              )}
            />
          ))}
        </View>
        {(errs.startDate || errs.endDate) && (
          <Text className="text-sm text-minus">날짜를 YYYY-MM-DD로, 종료일은 시작일 이후로 입력해 주세요</Text>
        )}
      </ScrollView>
      <View className="gap-2 px-5 pb-4">
        {error && <Text className="text-[13px] text-minus">{error}</Text>}
        <PrimaryButton title="만들기" disabled={!formState.isValid || formState.isSubmitting} onPress={submit} />
      </View>
    </SafeAreaView>
  );
}
