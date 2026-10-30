import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Calendar } from 'iconoir-react-native';
import { Fragment, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Icon } from '@/components/Icon';
import { SplitoSymbol } from '@/components/Logo';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useCreateRoom } from '@/hooks/useRooms';
import { CURRENCIES, isCurrencyCode } from '@/lib/currency';
import { unitName } from '@/lib/money';
import { colors } from '@/theme/tokens';

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

type Field = 'name' | 'startDate' | 'endDate';

const FOCUS_RING = { boxShadow: '0 0 0 4px rgba(54,182,255,.18)' };

// 포커스가 아닐 때 'YYYY-MM-DD' → '10월 20일'
const prettyDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${Number(v.slice(5, 7))}월 ${Number(v.slice(8, 10))}일` : v);

export default function NewRoom() {
  const create = useCreateRoom();
  const [error, setError] = useState<string>();
  const [focus, setFocus] = useState<Field>();
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
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="새 여행" />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 140, gap: 28 }} keyboardShouldPersistTaps="handled">
        <Text style={{ letterSpacing: -0.52, lineHeight: 34 }} className="font-bold text-[26px] text-ink">
          어디로 떠나나요?
        </Text>

        <View className="gap-2">
          <Text className="font-semibold text-[13px] text-ink-500">여행 이름</Text>
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="여행 이름"
                value={field.value}
                onChangeText={field.onChange}
                onFocus={() => setFocus('name')}
                onBlur={() => setFocus(undefined)}
                maxLength={30}
                placeholder="예: 오사카 먹방 여행"
                placeholderTextColor={colors.ink[300]}
                style={focus === 'name' ? FOCUS_RING : undefined}
                className={`h-[54px] rounded-input border-[1.5px] bg-white px-4 font-semibold text-[17px] text-ink ${
                  focus === 'name' ? 'border-primary' : errs.name && field.value ? 'border-danger' : 'border-line'
                }`}
              />
            )}
          />
        </View>

        <View className="gap-2.5">
          <Text className="font-semibold text-[13px] text-ink-500">기본 통화</Text>
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
                      className={`h-11 flex-row items-center gap-1.5 rounded-xl border-[1.5px] px-3.5 ${
                        selected ? 'border-primary bg-sky-100' : 'border-line bg-white'
                      }`}
                    >
                      <Text className={`font-semibold text-[15px] ${selected ? 'text-primary-text' : 'text-ink-700'}`}>{c.code}</Text>
                      <Text style={{ opacity: 0.75 }} className={`font-medium text-[13px] ${selected ? 'text-primary-text' : 'text-ink-700'}`}>
                        {unitName(c.code, c.label)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        </View>

        <View className="gap-2">
          <Text className="font-semibold text-[13px] text-ink-500">
            기간 <Text className="font-medium text-ink-300">선택</Text>
          </Text>
          <View className="flex-row items-center gap-2">
            {(['startDate', 'endDate'] as const).map((n, i) => (
              <Fragment key={n}>
                {i === 1 && <Text className="text-ink-300">–</Text>}
                <Controller
                  control={control}
                  name={n}
                  render={({ field }) => (
                    <View
                      style={focus === n ? FOCUS_RING : undefined}
                      className={`h-[54px] flex-1 flex-row items-center gap-2 rounded-input border-[1.5px] bg-app px-3.5 ${
                        focus === n ? 'border-primary' : errs[n] && field.value ? 'border-danger' : 'border-app'
                      }`}
                    >
                      <Icon as={Calendar} size={18} color={colors.primary.text} />
                      <TextInput
                        accessibilityLabel={n === 'startDate' ? '시작일' : '종료일'}
                        value={focus === n ? field.value : prettyDate(field.value)}
                        onChangeText={field.onChange}
                        onFocus={() => setFocus(n)}
                        onBlur={() => setFocus(undefined)}
                        maxLength={10}
                        keyboardType="numbers-and-punctuation"
                        placeholder={focus === n ? 'YYYY-MM-DD' : n === 'startDate' ? '시작일' : '종료일'}
                        placeholderTextColor={colors.ink[300]}
                        className="h-full flex-1 font-semibold text-base text-ink"
                      />
                    </View>
                  )}
                />
              </Fragment>
            ))}
          </View>
          {(errs.startDate || errs.endDate) && (
            <Text className="text-[13px] text-danger">날짜를 YYYY-MM-DD로, 종료일은 시작일 이후로 입력해 주세요</Text>
          )}
        </View>

        <View className="flex-row items-center gap-3 rounded-button bg-sky-100 px-4 py-3.5">
          <SplitoSymbol size={40} />
          <Text className="flex-1 text-sm leading-5 text-primary-on">
            처음엔 나 혼자인 가계부로 시작해요. 만든 뒤 링크로 동행을 초대할 수 있어요.
          </Text>
        </View>
      </ScrollView>
      <BottomBar>
        {error && <Text className="text-[13px] text-danger">{error}</Text>}
        <PrimaryButton title="만들기" loading={formState.isSubmitting} disabled={!formState.isValid} onPress={submit} />
      </BottomBar>
    </SafeAreaView>
  );
}
