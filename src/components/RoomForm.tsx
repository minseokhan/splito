import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar } from 'iconoir-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { DateSheet } from '@/components/DateSheet';
import { Icon } from '@/components/Icon';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
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

export type RoomFormValues = z.infer<typeof schema>;

type DateField = 'startDate' | 'endDate';

const FOCUS_RING = { boxShadow: '0 0 0 4px rgba(94,196,255,.18)' };

// 'YYYY-MM-DD' → '10월 20일'
const prettyDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${Number(v.slice(5, 7))}월 ${Number(v.slice(8, 10))}일` : v);

type Props = {
  heading?: string; // 없으면 제목 줄을 그리지 않는다(여행 방 설정은 NavBar 제목만 쓴다)
  submitLabel: string;
  defaultValues: RoomFormValues;
  onSubmit: (v: RoomFormValues) => Promise<void>;
  children?: ReactNode; // 폼 아래 안내 칸(새 여행에서만 쓴다)
};

// 여행 이름·기본 통화·기간 폼. 새 여행과 여행 수정이 같이 쓴다.
export function RoomForm({ heading, submitLabel, defaultValues, onSubmit, children }: Props) {
  const [error, setError] = useState<string>();
  const [nameFocus, setNameFocus] = useState(false);
  const [dateSheet, setDateSheet] = useState<DateField>();
  const { control, handleSubmit, formState, setValue } = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues,
  });
  const errs = formState.errors;
  const [startDate, endDate] = useWatch({ control, name: ['startDate', 'endDate'] });
  const setDate = (n: DateField, v: string) => setValue(n, v, { shouldValidate: true });

  const pickDate = (d: string) => {
    setDate(dateSheet!, d);
    // 시작일을 종료일 뒤로 옮기면 종료일은 비운다. 달력이 못 만드는 조합은 남기지 않는다.
    if (dateSheet === 'startDate' && endDate && d > endDate) setDate('endDate', '');
    setDateSheet(undefined);
  };

  const submit = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await onSubmit({ ...v, name: v.name.trim() });
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 140, gap: 28 }} keyboardShouldPersistTaps="handled">
        {!!heading && <Text className="font-semibold text-2xl text-ink">{heading}</Text>}

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
                onFocus={() => setNameFocus(true)}
                onBlur={() => setNameFocus(false)}
                maxLength={30}
                placeholder="예: 오사카 먹방 여행"
                placeholderTextColor={colors.ink[300]}
                style={nameFocus ? FOCUS_RING : undefined}
                className={`h-[54px] rounded-input border-[1.5px] bg-white px-4 font-semibold text-[17px] text-ink ${
                  nameFocus ? 'border-primary' : errs.name && field.value ? 'border-danger' : 'border-line'
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
                      className={`h-11 flex-row items-center gap-1.5 rounded-chip border-[1.5px] px-3.5 ${
                        selected ? 'border-primary bg-sky-100' : 'border-line bg-white'
                      }`}
                    >
                      <Text className={`font-semibold text-base ${selected ? 'text-primary-text' : 'text-ink-700'}`}>{c.code}</Text>
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
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-[13px] text-ink-500">
              기간 <Text className="font-medium text-ink-300">선택</Text>
            </Text>
            {(startDate || endDate) && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDate('startDate', '');
                  setDate('endDate', '');
                }}
                hitSlop={8}
              >
                <Text className="font-semibold text-[13px] text-ink-400">지우기</Text>
              </Pressable>
            )}
          </View>
          <View className="flex-row items-center gap-2">
            {(['startDate', 'endDate'] as const).map((n, i) => {
              const value = n === 'startDate' ? startDate : endDate;
              const label = n === 'startDate' ? '시작일' : '종료일';
              return (
                <Fragment key={n}>
                  {i === 1 && <Text className="text-ink-300">–</Text>}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${label} 고르기`}
                    onPress={() => setDateSheet(n)}
                    className={`h-[54px] flex-1 flex-row items-center gap-2 rounded-input border-[1.5px] bg-app px-3.5 active:bg-sky-100 ${
                      dateSheet === n ? 'border-primary' : 'border-app'
                    }`}
                  >
                    <Icon as={Calendar} size={18} color={colors.primary.text} />
                    <Text className={`font-semibold text-base ${value ? 'text-ink' : 'text-ink-300'}`} numberOfLines={1}>
                      {value ? prettyDate(value) : label}
                    </Text>
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
        </View>

        {children}
      </ScrollView>
      <BottomBar>
        {error && <Text className="text-[13px] text-danger">{error}</Text>}
        <PrimaryButton title={submitLabel} loading={formState.isSubmitting} disabled={!formState.isValid} onPress={submit} />
      </BottomBar>
      <DateSheet
        visible={!!dateSheet}
        title={dateSheet === 'endDate' ? '종료일' : '시작일'}
        value={(dateSheet === 'endDate' ? endDate : startDate) || ''}
        // 종료일은 시작일 이후만 고를 수 있다. 여행은 미래라 상한은 두지 않는다.
        min={dateSheet === 'endDate' ? startDate || undefined : undefined}
        onPick={pickDate}
        onClose={() => setDateSheet(undefined)}
      />
    </>
  );
}
