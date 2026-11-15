import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, Check, NavArrowDown } from 'iconoir-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { BottomSheet } from '@/components/BottomSheet';
import { DateSheet } from '@/components/DateSheet';
import { Icon } from '@/components/Icon';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { CURRENCIES, isCurrencyCode } from '@/lib/currency';
import { currencyFlag } from '@/lib/flag';
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
  children?: ReactNode; // 폼 아래 칸(새 여행 안내, 여행 방 설정의 참여자·삭제)
  cards?: boolean; // 회색 배경 위 흰 카드 하나에 담는다(여행 방 설정). 화면 배경은 호출하는 쪽이 bg-app으로 깐다
};

// 통화 고르기에서는 유로도 깃발이 있어야 줄이 맞는다. currencyFlag는 홈 카드용이라 EUR을 비워 둔다(비행기로 대체).
const flagOf = (code: string) => (code === 'EUR' ? '🇪🇺' : currencyFlag(code));

const CARD_SHADOW = { boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' };

// 여행 이름·기본 통화·기간 폼. 새 여행과 여행 수정이 같이 쓴다.
export function RoomForm({ heading, submitLabel, defaultValues, onSubmit, children, cards }: Props) {
  // 카드 모드에서는 이름·통화·기간을 흰 카드 하나에 담는다
  const group = cards ? 'gap-6 rounded-card bg-white p-5' : 'gap-7';
  const [error, setError] = useState<string>();
  const [nameFocus, setNameFocus] = useState(false);
  const [dateSheet, setDateSheet] = useState<DateField>();
  const [currencyOpen, setCurrencyOpen] = useState(false);
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

        <View className={group} style={cards ? CARD_SHADOW : undefined}>
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
              render={({ field }) => {
                const cur = CURRENCIES.find((c) => c.code === field.value);
                return (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="기본 통화 고르기"
                      onPress={() => setCurrencyOpen(true)}
                      className={`h-[54px] flex-row items-center gap-2 rounded-input border-[1.5px] bg-app px-4 active:bg-sky-100 ${
                        currencyOpen ? 'border-primary' : 'border-app'
                      }`}
                    >
                      {cur && <Text className="text-xl">{flagOf(cur.code)}</Text>}
                      <Text className="font-semibold text-base text-ink">{cur?.code}</Text>
                      <Text className="flex-1 font-medium text-[15px] text-ink-500">{cur && unitName(cur.code, cur.label)}</Text>
                      <Icon as={NavArrowDown} size={18} color={colors.ink[400]} />
                    </Pressable>
                    <BottomSheet visible={currencyOpen} onClose={() => setCurrencyOpen(false)} title="기본 통화">
                      <ScrollView style={{ maxHeight: 420 }}>
                        {CURRENCIES.map((c) => {
                          const selected = field.value === c.code;
                          return (
                            <Pressable
                              key={c.code}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              accessibilityLabel={c.label}
                              onPress={() => {
                                field.onChange(c.code);
                                setCurrencyOpen(false);
                              }}
                              className={`h-[52px] flex-row items-center gap-3 rounded-input px-3 ${selected ? 'bg-sky-100' : 'active:bg-app'}`}
                            >
                              <Text className="text-xl">{flagOf(c.code)}</Text>
                              <Text className={`w-12 font-semibold text-base ${selected ? 'text-primary-text' : 'text-ink'}`}>{c.code}</Text>
                              <Text className={`flex-1 text-[15px] ${selected ? 'text-primary-text' : 'text-ink-500'}`}>{c.label}</Text>
                              {selected && <Icon as={Check} size={20} color={colors.primary.text} />}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </BottomSheet>
                  </>
                );
              }}
            />
          </View>

          <View className="gap-2">
            <Text className="font-semibold text-[13px] text-ink-500">
              기간 <Text className="font-medium text-ink-300">선택</Text>
            </Text>
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
        </View>

        {children}
      </ScrollView>
      <BottomBar bg={cards ? colors.app : undefined} fade={cards}>
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
