import { router, useLocalSearchParams } from 'expo-router';
import { Link as LinkIcon, RefreshDouble, Sparks, Trash, XmarkCircle } from 'iconoir-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, GuestChip } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { PassSheet } from '@/components/PassSheets';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoomForm } from '@/components/RoomForm';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useRefetchBooking, useTripBooking, useUnlinkBooking } from '@/hooks/useBooking';
import { useDeleteRoom, useRemoveMember, useRoom, useRoomMembers, useRoomPass, useUpdateRoom } from '@/hooks/useRooms';
import { useSettlePlan } from '@/hooks/useSettlement';
import { toUserError } from '@/lib/errors';
import { DEMO_AI_USED, passRow } from '@/lib/pass';
import { formatKrw } from '@/lib/money';
import { lookupBooking } from '@/services/hanatour';
import { colors } from '@/theme/tokens';
import type { RoomMember } from '@/types/domain';

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
  const [kickTarget, setKickTarget] = useState<RoomMember>();
  const { data: members = [] } = useRoomMembers(roomId);
  const { data: balances, me, plan = [] } = useSettlePlan(roomId);
  const kick = useRemoveMember(roomId);
  const isOwner = room?.owner_id === myId;
  const { data: passRec } = useRoomPass(roomId);
  const passInfo = passRow({
    on: !!passRec,
    used: DEMO_AI_USED,
    owner: isOwner,
    paidBy: members.find((m) => m.id === passRec?.paid_by_member_id)?.name,
    splitDone: passRec?.split,
  });
  const [passOpen, setPassOpen] = useState(false);
  // 멤버 화면과 같은 기준: QR로만 들어온 사람은 동행이 아니다
  const active = members.filter((m) => !m.leftAt && !m.spotOnly);
  const colorIndex = new Map(members.map((m, i) => [m.id, i]));
  const netOf = (id: string) => balances?.rows.find((b) => b.memberId === id)?.net ?? 0;

  // '정산 완료' / '나 → 서연 244,920원 남음'. 나와 직접 오갈 송금이 없으면 '정산 남음'만 쓴다.
  const settleLabel = (m: RoomMember) => {
    if (netOf(m.id) === 0) return null;
    const out = plan.find((t) => t.from === me?.id && t.to === m.id);
    if (out) return `나 → ${m.name} ${formatKrw(out.amount)} 남음`;
    const inc = plan.find((t) => t.from === m.id && t.to === me?.id);
    if (inc) return `${m.name} → 나 ${formatKrw(inc.amount)} 남음`;
    return '정산 남음';
  };
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
    <SafeAreaView edges={['top']} className="flex-1 bg-app">
      <NavBar title="여행 방 설정" />
      {!!room && (
        <RoomForm
          submitLabel="저장"
          cards
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
          {/* 여행 패스: room_passes에 행이 있으면 이용 중. AI 사용 건수는 아직 시안 값이다(src/lib/pass.ts). */}
          <View className="gap-2.5">
            <Text className="px-1 font-semibold text-[13px] text-ink-500">여행 패스</Text>
            <View className="flex-row items-center gap-3 rounded-[22px] bg-white px-5 py-[18px]" style={{ boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' }}>
              <View className={`h-10 w-10 items-center justify-center rounded-xl ${passRec ? 'bg-primary' : 'bg-muted'}`}>
                <Icon as={Sparks} size={20} color={passRec ? colors.primary.on : colors.ink[400]} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-semibold text-base text-ink">{passInfo.title}</Text>
                <Text className="text-xs text-ink-400">{passInfo.sub}</Text>
              </View>
              {passInfo.button && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (isOwner ? setPassOpen(true) : toast('방장에게 결제 요청을 보냈어요'))}
                  className="h-[34px] justify-center rounded-[10px] bg-ink px-3 active:bg-black"
                >
                  <Text className="font-semibold text-[13px] text-white">{passInfo.button}</Text>
                </Pressable>
              )}
            </View>
          </View>
          <View className="gap-2.5">
            <Text className="px-1 font-semibold text-[13px] text-ink-500">참여자 {active.length}명</Text>
            <View className="rounded-card bg-white px-4 py-1" style={{ boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' }}>
              {active.map((m, i) => {
                const mine = m.userId === myId;
                const pending = mine ? null : settleLabel(m);
                return (
                  <View key={m.id} className={`min-h-11 flex-row items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-muted' : ''}`}>
                    <Avatar name={m.name} colorIndex={colorIndex.get(m.id) ?? 0} guest={m.kind === 'guest'} size={36} />
                    <View className="flex-1 gap-0.5">
                      <View className="flex-row items-center gap-2">
                        <Text className="shrink font-semibold text-base text-ink" numberOfLines={1}>
                          {mine ? `${m.name} (나)` : m.name}
                        </Text>
                        {m.userId === room.owner_id && (
                          <View className="rounded-badge bg-sky-100 px-1.5 py-0.5">
                            <Text className="font-semibold text-xs text-primary-text">방장</Text>
                          </View>
                        )}
                        {m.kind === 'guest' && <GuestChip />}
                      </View>
                      {!mine && (
                        <Text className={`text-xs ${pending ? 'text-warning' : 'text-ink-400'}`} numberOfLines={1}>
                          {pending ?? '정산 완료'}
                        </Text>
                      )}
                    </View>
                    {isOwner && !mine && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${m.name} 내보내기`}
                        onPress={() => setKickTarget(m)}
                        className="rounded-chip border-[1.5px] border-line bg-white px-3.5 py-2 active:bg-muted"
                      >
                        <Text className="font-semibold text-[13px] text-ink-700">내보내기</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

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
          {isOwner ? (
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
          <PrimaryButton title="취소" variant="muted" size="md" grow onPress={() => setConfirmUnlink(false)} />
          <PrimaryButton
            title="해제하기"
            variant="dark"
            size="md"
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
          <PrimaryButton title="취소" variant="muted" size="md" grow onPress={() => setConfirmDelete(false)} />
          <PrimaryButton
            title="삭제"
            variant="danger"
            size="md"
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
      <BottomSheet
        visible={!!kickTarget}
        onClose={() => setKickTarget(undefined)}
        title={`${kickTarget?.name ?? ''}님을 내보낼까요?`}
        subtitle={[
          kickTarget && netOf(kickTarget.id) !== 0
            ? '아직 정산이 남아 있어요. 내보내도 지출 기록과 남은 금액은 장부에 그대로 남아요.'
            : '지출 기록은 장부에 그대로 남아요.',
          kickTarget?.kind === 'user' ? '초대 링크는 새로 바뀌어요.' : '',
        ].join(' ').trim()}
      >
        <View className="flex-row gap-2">
          <PrimaryButton title="취소" variant="muted" size="md" grow onPress={() => setKickTarget(undefined)} />
          <PrimaryButton
            title="내보내기"
            variant="danger"
            size="md"
            grow
            loading={kick.isPending}
            onPress={() =>
              kickTarget &&
              kick.mutate(
                { roomId, memberId: kickTarget.id },
                {
                  onSuccess: () => {
                    toast(`${kickTarget.name}님을 내보냈어요`);
                    setKickTarget(undefined);
                  },
                  onError: (e) => Alert.alert(toUserError(e).message),
                },
              )
            }
          />
        </View>
      </BottomSheet>
      <PassSheet
        visible={passOpen}
        owner={isOwner}
        memberCount={active.length}
        onClose={() => setPassOpen(false)}
        onPay={() => {
          setPassOpen(false);
          toast('결제는 곧 열려요');
        }}
        onRequest={() => setPassOpen(false)}
      />
    </SafeAreaView>
  );
}
