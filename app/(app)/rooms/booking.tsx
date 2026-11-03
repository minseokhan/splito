import { router, useLocalSearchParams } from 'expo-router';
import { Check, CheckCircle, Link as LinkIcon, WarningCircle, WarningTriangle, XmarkCircle } from 'iconoir-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { useCreateRoom } from '@/hooks/useRooms';
import { BOOKING_NO_MAX, isValidBookingNo, normalizeBookingNo } from '@/lib/booking';
import { api } from '@/services/api';
import { bookingPeriodLabel, lookupBooking, type BookingInfo } from '@/services/hanatour';
import { colors } from '@/theme/tokens';
import { useQueryClient } from '@tanstack/react-query';

const CONSENT_TEXT = `[필수] 개인정보 제3자 제공 동의

· 제공받는 자: 주식회사 하나투어
· 제공 목적: 패키지 예약 조회 및 여행 일정·결제 정보 연동
· 제공 항목: 예약번호, 예약자 이름
· 보유·이용 기간: 조회 처리 완료 시까지(조회에만 사용하고 저장하지 않습니다)

동의를 거부할 수 있으나, 거부하면 패키지 예약을 불러올 수 없습니다.
불러온 예약자 이름은 여행 방에 마스킹(예: 이*지)해서 보관합니다.`;

// 조회 결과 박스. 성공 외에는 안내 + 대안 버튼만 보여준다(명세 §2-2).
type Result =
  | { kind: 'success'; booking: BookingInfo; room: { name: string; baseCurrency: string } }
  | { kind: 'notFound' }
  | { kind: 'canceled' }
  | { kind: 'fail' }
  | { kind: 'already'; roomId: string | null; roomName: string | null };

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

export default function BookingLookup() {
  // roomId가 있으면 '이 방에 붙이기'(여행 방 설정 진입), 없으면 새 방을 만든다.
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const [no, setNo] = useState('');
  const [holder, setHolder] = useState('');
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const create = useCreateRoom();
  const qc = useQueryClient();

  const noInvalid = no.length > 0 && !isValidBookingNo(no);
  const canLookup = consent && isValidBookingNo(no) && holder.trim().length > 0;

  // 입력을 바꾸면 결과를 지우고 '조회하기' 상태로 돌아간다(명세 §2-1).
  const edit = (set: (v: string) => void) => (v: string) => {
    setResult(null);
    set(v);
  };

  const lookup = async () => {
    if (!canLookup || busy) return;
    setBusy(true);
    try {
      const owner = await api.bookingOwner(no);
      if (owner) {
        setResult({ kind: 'already', roomId: owner.roomId, roomName: owner.roomName });
        return;
      }
      setResult(await lookupBooking(no, holder));
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (result?.kind !== 'success' || busy) return;
    setBusy(true);
    try {
      const target =
        roomId ??
        (await create.mutateAsync({
          name: result.room.name,
          baseCurrency: result.room.baseCurrency,
          startDate: result.booking.start_date,
          endDate: result.booking.end_date,
        }));
      await api.linkBooking({ roomId: target, booking: result.booking });
      await qc.invalidateQueries({ queryKey: ['room', target] });
      if (roomId) router.back();
      else router.replace({ pathname: '/rooms/[roomId]/prepay', params: { roomId: target } });
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const cta = result === null ? '조회하기' : result.kind === 'success' ? '이 예약으로 만들기' : '다시 조회하기';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="패키지 예약 불러오기" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 140, gap: 22 }}>
        <Text className="font-semibold text-2xl text-ink">예약 정보를 입력해 주세요</Text>

        <View className="gap-2">
          <Text className="font-semibold text-[13px] text-ink-500">예약번호</Text>
          <TextField
            value={no}
            onChangeText={edit((v) => setNo(normalizeBookingNo(v)))}
            placeholder="예: HT2410-58213"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={BOOKING_NO_MAX}
            invalid={noInvalid}
            accessibilityLabel="예약번호"
          />
          {noInvalid && (
            <View className="flex-row items-center gap-1">
              <Icon as={WarningCircle} size={15} color={colors.danger.DEFAULT} />
              <Text className="text-[13px] text-danger">예약번호 형식이 올바르지 않아요.</Text>
            </View>
          )}
        </View>

        <View className="gap-2">
          <Text className="font-semibold text-[13px] text-ink-500">예약자 이름</Text>
          <TextField
            value={holder}
            onChangeText={edit(setHolder)}
            placeholder="예약할 때 쓴 이름"
            accessibilityLabel="예약자 이름"
          />
        </View>

        <View className="gap-2 rounded-button bg-app p-3.5">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => setConsent((v) => !v)}
            className="flex-row items-center gap-2.5"
          >
            <View
              className={`h-[26px] w-[26px] items-center justify-center rounded-full ${consent ? 'bg-primary' : 'bg-line-off'}`}
            >
              <Icon as={Check} size={16} color="#FFFFFF" />
            </View>
            <Text className="flex-1 font-semibold text-[15px] text-ink">
              <Text className="text-primary-text">[필수]</Text> 개인정보 제3자 제공 동의
            </Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setTerms(true)}>
              <Text className="text-[13px] text-ink-400">보기 ›</Text>
            </Pressable>
          </Pressable>
          <Text className="pl-[34px] text-xs text-ink-400">
            예약 조회를 위해 예약번호와 예약자 이름을 하나투어에 제공해요
          </Text>
        </View>

        {result?.kind === 'success' && (
          <View className="gap-3 rounded-card border border-sky-200 bg-sky-50 p-[18px]">
            <View className="flex-row items-center gap-1.5">
              <Icon as={CheckCircle} size={16} color={colors.primary.text} />
              <Text className="font-semibold text-[13px] text-primary-text">예약을 찾았어요</Text>
            </View>
            <Text className="font-semibold text-[17px] text-ink">{result.booking.product_name}</Text>
            <View className="gap-1.5">
              <Field label="여행지" value={result.booking.destination} />
              <Field label="기간" value={bookingPeriodLabel(result.booking)} />
              <Field label="예약 인원" value={`성인 ${result.booking.pax}명`} />
              <Field label="결제 금액" value={formatKrw(result.booking.paid_amount)} />
            </View>
          </View>
        )}

        {result?.kind === 'notFound' && (
          <ResultBox
            tone="danger"
            icon={WarningCircle}
            title="예약을 찾을 수 없어요"
            body="예약번호와 예약자 이름을 다시 확인해 주세요."
          />
        )}
        {result?.kind === 'canceled' && (
          <ResultBox
            tone="danger"
            icon={XmarkCircle}
            title="취소된 예약이에요"
            body="취소된 예약은 불러올 수 없어요."
            action={{ label: '직접 만들기', onPress: () => router.replace('/rooms/new') }}
          />
        )}
        {result?.kind === 'already' && (
          <ResultBox
            tone="muted"
            icon={LinkIcon}
            title={result.roomName ? '이미 연결된 예약이에요' : '다른 여행 방에 연결된 예약이에요'}
            body={
              result.roomName
                ? `‘${result.roomName}’ 여행 방에 연결돼 있어요.`
                : '그 방의 참여자에게 초대를 요청해 주세요.'
            }
            action={
              result.roomId
                ? {
                    label: '기존 방으로 이동',
                    onPress: () =>
                      router.replace({ pathname: '/rooms/[roomId]', params: { roomId: result.roomId! } }),
                  }
                : undefined
            }
          />
        )}
        {result?.kind === 'fail' && (
          <ResultBox
            tone="warning"
            icon={WarningTriangle}
            title="예약 정보를 불러오지 못했어요"
            body="지금은 하나투어에 연결할 수 없어요. 직접 만들고 나중에 여행 방 설정에서 불러올 수 있어요."
            action={{ label: '직접 만들기로 시작', onPress: () => router.replace('/rooms/new') }}
          />
        )}
      </ScrollView>

      <BottomBar>
        <PrimaryButton
          title={cta}
          variant="dark"
          loading={busy}
          disabled={!canLookup}
          onPress={result?.kind === 'success' ? confirm : lookup}
        />
      </BottomBar>

      <BottomSheet visible={terms} onClose={() => setTerms(false)} title="개인정보 제3자 제공 동의">
        <ScrollView style={{ maxHeight: 360 }}>
          <Text className="text-sm leading-6 text-ink-500">{CONSENT_TEXT}</Text>
        </ScrollView>
        <PrimaryButton title="확인" variant="muted" onPress={() => setTerms(false)} />
      </BottomSheet>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="w-[72px] text-sm text-ink-400">{label}</Text>
      <Text className="flex-1 text-sm font-medium text-ink">{value}</Text>
    </View>
  );
}

type BoxProps = {
  tone: 'danger' | 'muted' | 'warning';
  icon: React.ComponentType<import('react-native-svg').SvgProps>;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
};

const TONE = {
  danger: { box: 'bg-[#FEF3F2]', icon: colors.danger.DEFAULT, title: 'text-[#B42318]', body: 'text-[#7A271A]' },
  muted: { box: 'bg-app', icon: colors.primary.text, title: 'text-ink', body: 'text-ink-500' },
  warning: { box: 'bg-warning-banner', icon: colors.warning.DEFAULT, title: 'text-warning-deep', body: 'text-warning-deep' },
} as const;

function ResultBox({ tone, icon, title, body, action }: BoxProps) {
  const t = TONE[tone];
  return (
    <View className={`flex-row gap-2.5 rounded-button p-3.5 ${t.box}`}>
      <Icon as={icon} size={20} color={t.icon} />
      <View className="flex-1 gap-0.5">
        <Text className={`font-semibold text-[15px] ${t.title}`}>{title}</Text>
        <Text className={`text-[13px] ${t.body}`}>{body}</Text>
        {!!action && (
          <Pressable
            accessibilityRole="button"
            onPress={action.onPress}
            className="mt-2 h-[34px] self-start justify-center rounded-[10px] border-[1.5px] border-line bg-white px-3"
          >
            <Text className="font-semibold text-[13px] text-ink">{action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
