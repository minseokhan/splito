import { router, useLocalSearchParams } from 'expo-router';
import { Link as LinkIcon, NavArrowRight, RefreshDouble, Suitcase, XmarkCircle } from 'iconoir-react-native';
import { Fragment, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useRefetchBooking, useTripBooking, useUnlinkBooking } from '@/hooks/useBooking';
import { useMyRooms, useRoom } from '@/hooks/useRooms';
import { CURRENCIES } from '@/lib/currency';
import { md } from '@/lib/tripDays';
import { lookupBooking } from '@/services/hanatour';
import { colors } from '@/theme/tokens';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

// '오늘 09:12' / '10.21 09:12'
function fetchedLabel(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return `${sameDay ? '오늘' : `${d.getMonth() + 1}.${d.getDate()}`} ${hh}:${mm}`;
}

// 이름·통화·기간은 여행을 만든 사람만 바꿀 수 있다(update_room). 아니면 값만 보여준다.
function Row({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      disabled={!onPress}
      onPress={onPress}
      className="flex-row items-center gap-3 px-5 py-[15px]"
    >
      <Text className="flex-1 text-[15px] text-ink-500">{label}</Text>
      <Text className="font-semibold text-[15px] text-ink">{value}</Text>
      {!!onPress && <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />}
    </Pressable>
  );
}

export default function RoomSettings() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { data: room } = useRoom(roomId);
  const { data: rooms } = useMyRooms();
  const { data: booking } = useTripBooking(roomId);
  const refetch = useRefetchBooking(roomId);
  const unlink = useUnlinkBooking(roomId);
  const toast = useToast();
  const myId = useAuth().session?.user.id;
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  const memberCount = rooms?.find((r) => r.roomId === roomId)?.memberCount ?? 0;

  if (!room) return <SafeAreaView edges={['top']} className="flex-1 bg-app" />;

  const currency = CURRENCIES.find((c) => c.code === room.base_currency);
  const goEdit =
    room.owner_id === myId ? () => router.push({ pathname: '/rooms/[roomId]/edit', params: { roomId } }) : undefined;
  const rows = [
    { label: '여행 이름', value: room.name, onPress: goEdit },
    { label: '기본 통화', value: currency ? `${currency.code} · ${currency.label.split(' ').pop()}` : room.base_currency, onPress: goEdit },
    {
      label: '기간',
      value: room.start_date ? `${md(room.start_date)} – ${room.end_date ? md(room.end_date) : ''}` : '미정',
      onPress: goEdit,
    },
    {
      label: '참여자',
      value: `${memberCount}명`,
      onPress: () => router.push({ pathname: '/rooms/[roomId]/members', params: { roomId } }),
    },
  ];

  // 다시 불러오기: 사용자가 수정한 일정은 서버가 보존한다(refetch_booking).
  const doRefetch = async () => {
    if (!booking || busy) return;
    setBusy(true);
    try {
      const r = await lookupBooking(booking.booking_no, booking.holder_masked);
      if (r.kind !== 'success') throw { message: 'NOT_LINKED' };
      await refetch.mutateAsync({ roomId, booking: r.booking });
      toast('예약 정보를 다시 불러왔어요');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-app">
      <NavBar title="여행 방 설정" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 12 }}>
        <View className="rounded-[22px] bg-white py-1">
          {rows.map((r, i) => (
            <Fragment key={r.label}>
              {i > 0 && <View className="mx-5 h-px bg-muted" />}
              <Row {...r} />
            </Fragment>
          ))}
        </View>

        <Text className="px-1 pt-2.5 font-semibold text-[13px] text-ink-500">패키지 예약</Text>

        {booking ? (
          <>
            <View className="gap-1 rounded-[22px] bg-white px-5 py-[18px]">
              <View className="flex-row items-center gap-1.5">
                <View className="rounded-[6px] bg-sky-100 px-[7px] py-px">
                  <Text className="font-semibold text-[11px] text-primary-text">하나투어</Text>
                </View>
                <View className="flex-row items-center gap-[3px]">
                  <Icon as={LinkIcon} size={13} color={colors.success.DEFAULT} />
                  <Text className="font-semibold text-xs text-success">연결됨</Text>
                </View>
              </View>
              <Text className="mt-1 font-semibold text-base text-ink">{booking.product_name}</Text>
              <Text className="text-[13px] text-ink-500">
                예약번호 {booking.booking_no} · 성인 {booking.pax}명
              </Text>
              <Text className="text-xs text-ink-400">
                마지막으로 불러온 시각 {fetchedLabel(booking.last_fetched_at)}
              </Text>
            </View>

            <View className="rounded-[22px] bg-white py-1">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy }}
                disabled={busy}
                onPress={doRefetch}
                className="flex-row items-center gap-3 border-b border-muted px-5 py-4"
              >
                <Icon as={RefreshDouble} size={22} color={colors.ink[500]} />
                <Text className="flex-1 font-semibold text-base text-ink">예약 정보 다시 불러오기</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmUnlink(true)}
                className="flex-row items-center gap-3 px-5 py-4"
              >
                <Icon as={XmarkCircle} size={22} color={colors.danger.text} />
                <Text className="flex-1 font-semibold text-base text-danger-text">연동 해제</Text>
              </Pressable>
            </View>
            <Text className="px-1 text-xs text-ink-400">연동을 해제해도 지금까지 올린 지출은 그대로 남아요.</Text>
          </>
        ) : (
          <View className="rounded-[22px] bg-white py-1">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/rooms/booking', params: { roomId } })}
              className="flex-row items-center gap-3 px-5 py-4"
            >
              <Icon as={Suitcase} size={22} color={colors.ink[500]} />
              <View className="flex-1">
                <Text className="font-semibold text-base text-ink">패키지 예약 불러오기</Text>
                <Text className="text-xs text-ink-400">일정과 선결제 금액을 이 여행 방에 넣어요</Text>
              </View>
              <Icon as={NavArrowRight} size={18} color={colors.ink[300]} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      <BottomSheet
        visible={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        title="예약 연동을 해제할까요?"
        subtitle="패키지 일정과 예정 지출 표시가 사라져요. 지금까지 올린 지출과 정산은 그대로 남아요."
      >
        <View className="flex-row gap-2">
          <PrimaryButton title="취소" variant="muted" grow onPress={() => setConfirmUnlink(false)} />
          <PrimaryButton
            title="해제하기"
            variant="dark"
            grow
            loading={unlink.isPending}
            onPress={() =>
              unlink.mutate(roomId, {
                onSuccess: () => {
                  setConfirmUnlink(false);
                  toast('연동을 해제했어요. 지출은 그대로예요');
                },
                onError: showError,
              })
            }
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
