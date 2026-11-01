import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Bell, Check, Eye, Lock, NavArrowDown } from 'iconoir-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { SplitoSymbol } from '@/components/Logo';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { useMyPayoutAccount, useSetPayoutAccount } from '@/hooks/usePayoutAccount';
import { BANKS, accountNumberSchema } from '@/lib/bank';
import { toUserError } from '@/lib/errors';
import { colors } from '@/theme/tokens';

// 계좌번호는 폼 상태에만 둔다. AsyncStorage·draft·로그에 남기지 않는다(PRD §7.3).
const schema = z.object({
  bankCode: z.string().min(1),
  holderName: z.string().trim().min(1).max(20),
  accountNumber: accountNumberSchema,
});

const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

function Label({ children }: { children: string }) {
  return <Text className="font-semibold text-sm text-ink-500">{children}</Text>;
}

function Notes() {
  // 원문 조회는 서버가 payout_reveals + 방 활동(room_event)으로 남긴다. 푸시 알림은 없다.
  const lines = [
    { icon: Eye, text: '나에게 줄 돈이 있는 사람에게만 계좌번호 전체가 보여요. 그 외에는 가려서 보여드려요.' },
    { icon: Bell, text: '누군가 계좌를 확인하면 여행 활동에 기록돼요.' },
  ];
  return (
    <View className="gap-3">
      {lines.map((l) => (
        <View key={l.text} className="flex-row items-start gap-2.5">
          <View className="mt-px">
            <Icon as={l.icon} size={22} color={colors.primary.text} />
          </View>
          <Text className="flex-1 text-[15px] text-ink-700">{l.text}</Text>
        </View>
      ))}
    </View>
  );
}

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
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="받을 계좌" onBack={editing ? () => setEditing(false) : undefined} />
      <ScrollView contentContainerClassName="gap-[22px] px-5 pt-3" contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {showForm ? (
          <>
            <View className="gap-2">
              <Label>은행</Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="은행 선택"
                onPress={() => setBankOpen(true)}
                className="h-[54px] flex-row items-center justify-between rounded-input border-[1.5px] border-line px-4"
              >
                <Text className={`font-semibold text-[17px] ${bank ? 'text-ink' : 'text-ink-300'}`}>{bank?.name ?? '은행을 골라주세요'}</Text>
                <Icon as={NavArrowDown} size={20} color={colors.ink[300]} />
              </Pressable>
            </View>
            <View className="gap-2">
              <Label>예금주</Label>
              <Controller
                control={control}
                name="holderName"
                render={({ field }) => (
                  <TextField accessibilityLabel="예금주" value={field.value} onChangeText={field.onChange} maxLength={20} />
                )}
              />
            </View>
            <View className="gap-2">
              <Label>계좌번호</Label>
              <Controller
                control={control}
                name="accountNumber"
                render={({ field, fieldState }) => {
                  const invalid = !!fieldState.error && field.value !== '';
                  return (
                    <>
                      <TextField
                        accessibilityLabel="계좌번호"
                        value={field.value}
                        onChangeText={field.onChange}
                        keyboardType="number-pad"
                        autoComplete="off"
                        maxLength={30}
                        placeholder="숫자만 입력해도 돼요"
                        invalid={invalid}
                      />
                      {invalid && <Text className="text-[13px] text-danger">계좌번호는 숫자 8~20자리로 입력해 주세요</Text>}
                    </>
                  );
                }}
              />
            </View>
            <Notes />
          </>
        ) : (
          <>
            <View className="gap-7 overflow-hidden rounded-card-lg bg-ink p-[22px]">
              {/* 어두운 배경 위 흰 실루엣은 10%면 안 보인다. 시안대로 컬러 심볼을 그대로 깐다.
                  크기·위치는 심볼 윗변이 '암호화 저장' 배지 아래로 내려가게 잡는다(카드가 길어지면 간격만 더 벌어진다). */}
              <View className="absolute" style={{ right: -14, bottom: -46 }}>
                <SplitoSymbol size={124} opacity={0.95} />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-[17px] text-white">{current.bankName}</Text>
                <View className="flex-row items-center gap-1 rounded-badge px-2 py-1" style={{ backgroundColor: 'rgba(255,255,255,.14)' }}>
                  <Icon as={Lock} size={13} color="#FFFFFF" />
                  <Text className="font-semibold text-[13px] text-white">암호화 저장</Text>
                </View>
              </View>
              <View className="gap-1">
                <Text className="font-semibold text-[26px] text-white">****-****-{current.accountLast4}</Text>
                <Text className="text-[15px] text-on-dark-sub">예금주 {current.holderName}</Text>
              </View>
            </View>
            <Notes />
          </>
        )}
      </ScrollView>
      <BottomBar>
        {error && <Text className="text-[13px] text-danger">{error}</Text>}
        {showForm ? (
          <PrimaryButton title="저장" disabled={!formState.isValid} loading={formState.isSubmitting} onPress={submit} />
        ) : (
          <PrimaryButton title="계좌 변경하기" variant="muted" onPress={() => setEditing(true)} />
        )}
      </BottomBar>
      <BottomSheet visible={bankOpen} onClose={() => setBankOpen(false)} title="은행 선택">
        <ScrollView className="max-h-96">
          {BANKS.map((b) => (
            <Pressable
              key={b.code}
              accessibilityRole="button"
              onPress={() => {
                setValue('bankCode', b.code, { shouldValidate: true });
                setBankOpen(false);
              }}
              className="h-[52px] flex-row items-center justify-between"
            >
              <Text className={`text-base ${b.code === bankCode ? 'font-semibold text-primary-text' : 'text-ink'}`}>{b.name}</Text>
              {b.code === bankCode && <Icon as={Check} size={20} color={colors.primary.text} />}
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}
