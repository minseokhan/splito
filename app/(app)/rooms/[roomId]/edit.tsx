import { router, useLocalSearchParams } from 'expo-router';
import { Link as LinkIcon, RefreshDouble, Trash, XmarkCircle } from 'iconoir-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoomForm } from '@/components/RoomForm';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useRefetchBooking, useTripBooking, useUnlinkBooking } from '@/hooks/useBooking';
import { useDeleteRoom, useRoom, useUpdateRoom } from '@/hooks/useRooms';
import { toUserError } from '@/lib/errors';
import { lookupBooking } from '@/services/hanatour';
import { colors } from '@/theme/tokens';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

// '오늘 09:12' / '10.21 09:12'
function fetchedLabel(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = d.toDateString() === new Date().toDateString();
  return `${sameDay ? '오늘' : `${d.getMonth() + 1}.${d.getDate()}`} ${hh}:${mm}`;
}

export default function EditRoom() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { data: room } = useRoom(roomId);
  const { data: booking } = useTripBooking(roomId);
  const update = useUpdateRoom(roomId);
  const remove = useDeleteRoom();
  const myId = useAuth().session?.user.id;
  const refetch = useRefetchBooking(roomId);
  const unlink = useUnlinkBooking(roomId);
  const toast = useToast();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="여행 방 설정" />
      {!!room && (
        <RoomForm
          submitLabel="저장"
          defaultValues={{
            name: room.name,
            baseCurrency: room.base_currency,
            startDate: room.start_date ?? '',
            endDate: room.end_date ?? '',
          }}
          // 지출이 있으면 서버가 기본 통화 변경을 CURRENCY_LOCKED로 막는다.
          onSubmit={async (v) => {
            await update.mutateAsync({
              roomId,
              name: v.name,
              baseCurrency: v.baseCurrency,
              startDate: v.startDate || null,
              endDate: v.endDate || null,
            });
            router.back();
          }}
        >
          {!!booking && (
            <View className="gap-2.5">
              <Text className="font-semibold text-[13px] text-ink-500">패키지 예약</Text>
              <View className="gap-1 rounded-card border border-card-line bg-white px-[18px] py-4">
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
                <Text className="text-xs text-ink-400">마지막으로 불러온 시각 {fetchedLabel(booking.last_fetched_at)}</Text>
                </View>

                <View className="rounded-card border border-card-line bg-white">
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy }}
                  disabled={busy}
                  onPress={doRefetch}
                  className="flex-row items-center gap-3 border-b border-muted px-[18px] py-4"
                >
                  <Icon as={RefreshDouble} size={22} color={colors.ink[500]} />
                  <Text className="flex-1 font-semibold text-base text-ink">예약 정보 다시 불러오기</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmUnlink(true)}
                  className="flex-row items-center gap-3 px-[18px] py-4"
                >
                  <Icon as={XmarkCircle} size={22} color={colors.danger.text} />
                  <Text className="flex-1 font-semibold text-base text-danger-text">연동 해제</Text>
                </Pressable>
                </View>
              <Text className="px-1 text-xs text-ink-400">연동을 해제해도 지금까지 올린 지출은 그대로 남아요.</Text>
            </View>
          )}

          {/* 여행 수정·삭제는 방장만 — 서버도 update_room·delete_room에서 같은 조건을 다시 본다 */}
          {room.owner_id === myId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmDelete(true)}
              className="flex-row items-center justify-center gap-2 rounded-card border border-card-line bg-white py-4"
            >
              <Icon as={Trash} size={20} color={colors.danger.text} />
              <Text className="font-semibold text-base text-danger-text">여행 삭제하기</Text>
            </Pressable>
          ) : (
            <Text className="px-1 text-[13px] text-ink-400">여행 정보 수정과 삭제는 방장만 할 수 있어요</Text>
          )}
        </RoomForm>
      )}

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

      <BottomSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="이 여행을 삭제할까요?"
        subtitle="지출·정산 기록이 모든 참여자에게서 사라져요. 되돌릴 수 없어요."
      >
        <View className="flex-row gap-2">
          <PrimaryButton title="취소" variant="muted" grow onPress={() => setConfirmDelete(false)} />
          <PrimaryButton
            title="삭제"
            variant="danger"
            grow
            loading={remove.isPending}
            onPress={() =>
              remove.mutate(roomId, {
                onSuccess: () => {
                  setConfirmDelete(false);
                  router.replace('/home');
                  toast('여행을 삭제했어요');
                },
                // 정산이 남아 있으면 서버가 ROOM_NOT_SETTLED로 막는다.
                onError: (e) => Alert.alert(toUserError(e).message),
              })
            }
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
