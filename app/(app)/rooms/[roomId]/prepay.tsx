import { router, useLocalSearchParams } from 'expo-router';
import { Check, Suitcase } from 'iconoir-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { GuestForm } from '@/components/GuestForm';
import { Icon } from '@/components/Icon';
import { InviteSheet } from '@/components/InviteSheet';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useTripBooking } from '@/hooks/useBooking';
import { useRoomMembers } from '@/hooks/useRooms';
import { perPersonPreview, prepayAmount } from '@/lib/booking';
import { dateLabel } from '@/lib/calendar';
import { uuidV4 } from '@/lib/uuid';
import { api } from '@/services/api';
import { colors } from '@/theme/tokens';
import type { MemberId } from '@/types/domain';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

export default function Prepay() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { data: booking } = useTripBooking(roomId);
  const { data: members = [] } = useRoomMembers(roomId);
  const myUserId = useAuth().session?.user.id;
  const [together, setTogether] = useState(true);
  const [sheet, setSheet] = useState<'invite' | 'guest' | null>(null);
  const [busy, setBusy] = useState(false);

  // QR로 들어온 사람은 동행이 아니다 — 고르는 목록에서 뺀다(장부에는 그대로 있다).
  const active = members.filter((m) => !m.leftAt && !m.spotOnly);
  const me = active.find((m) => m.userId === myUserId);
  const others = active.filter((m) => m.id !== me?.id);
  const goRoom = () => router.replace({ pathname: '/rooms/[roomId]', params: { roomId } });

  if (!booking || !me) return <SafeAreaView edges={['top']} className="flex-1 bg-white" />;

  // 빈 일행 칸의 몫은 결제자에게 남는다 — 기존 1/N 규칙 그대로다.
  // TODO(명세 확인필요 3): 빈 칸 몫을 나중에 들어온 참여자에게 넘기는 규칙이 정해지면 여기서 다시 나눈다.
  const slots = Array.from({ length: Math.max(booking.pax - 1, 0) }, (_, i) => others[i] ?? null);
  const amount = prepayAmount(booking.paid_amount, booking.pax, together);
  const scope: MemberId[] = together
    ? [me.id, ...slots.flatMap((s) => (s ? [s.id] : []))]
    : [me.id];

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await api.saveExpense(
        {
          id: uuidV4(),
          room_id: roomId,
          payer_kind: 'member',
          payer_member_id: me.id,
          source: 'manual',
          merchant: '패키지 상품 결제',
          paid_local_date: booking.paid_at ?? booking.start_date ?? new Date().toISOString().slice(0, 10),
          currency: 'KRW',
          category: 'other',
          scope_member_ids: scope,
          items: [{ id: uuidV4(), position: 0, name_original: '패키지 상품 결제', amount_original: amount }],
        },
        null,
      );
      // 금액·배분은 save_expense가 확정했다. 여기서는 표시용 태그만 붙인다.
      await api.setExpenseMeta({ expenseId: id, scheduleId: null, flags: ['auto_prepay', 'budget_excluded'] });
      goRoom();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="패키지 여행 등록" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 140, gap: 18 }}>
        <View className="gap-1.5">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-success-badge">
            <Icon as={Check} size={24} color={colors.success.DEFAULT} />
          </View>
          <Text className="mt-1.5 font-semibold text-[22px] text-ink">예약을 불러왔어요</Text>
          <Text className="text-[15px] text-ink-500">패키지 결제 금액을 ‘여행 전’ 지출로 등록했어요</Text>
        </View>

        <View className="gap-3 rounded-card border border-card-line p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-input bg-muted">
              <Icon as={Suitcase} size={22} color={colors.primary.text} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-semibold text-base text-ink">패키지 상품 결제</Text>
              <Text className="text-[13px] text-ink-400">
                하나투어{booking.paid_at ? ` · ${dateLabel(booking.paid_at)} 결제` : ''}
              </Text>
            </View>
            <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[17px] text-ink">
              {formatKrw(booking.paid_amount)}
            </Text>
          </View>
        </View>

        {booking.pax > 1 && (
          <View className="gap-3 rounded-card bg-app p-4">
            <View>
              <Text className="font-semibold text-[17px] text-ink">일행 몫도 함께 결제했나요?</Text>
              <Text className="text-[13px] text-ink-400">예약 인원 {booking.pax}명</Text>
            </View>
            <View className="flex-row gap-1.5 rounded-input bg-[#E9EDF2] p-1">
              {[
                { on: together, label: '네, 함께 결제했어요', set: true },
                { on: !together, label: '아니요, 제 몫만', set: false },
              ].map((seg) => (
                <Pressable
                  key={seg.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: seg.on }}
                  onPress={() => setTogether(seg.set)}
                  className={`h-10 flex-1 items-center justify-center rounded-[10px] ${seg.on ? 'bg-white' : ''}`}
                  style={seg.on ? { boxShadow: '0 2px 4px -2px rgba(19,25,39,.12)' } : undefined}
                >
                  <Text className={`font-semibold text-sm ${seg.on ? 'text-ink' : 'text-ink-400'}`}>{seg.label}</Text>
                </Pressable>
              ))}
            </View>

            {together ? (
              <>
                <View className="rounded-2xl bg-white px-3.5 py-1">
                  <View className="flex-row items-center gap-2.5 border-b border-muted py-2.5">
                    <Avatar name={me.name} colorIndex={0} size={32} />
                    <Text className="flex-1 font-semibold text-[15px] text-ink">나 ({me.name})</Text>
                    <Text className="font-semibold text-xs text-primary-text">결제자</Text>
                  </View>
                  {slots.map((s, i) => (
                    <View
                      key={s?.id ?? `empty-${i}`}
                      className={`flex-row items-center gap-2.5 py-2.5 ${i < slots.length - 1 ? 'border-b border-muted' : ''}`}
                    >
                      {s ? (
                        <>
                          <Avatar name={s.name} colorIndex={i + 1} guest={s.kind === 'guest'} size={32} />
                          <Text className="flex-1 font-semibold text-[15px] text-ink">
                            {s.name}
                            {s.kind === 'guest' && <Text className="text-xs text-ink-400"> 게스트</Text>}
                          </Text>
                        </>
                      ) : (
                        <>
                          <View className="h-8 w-8 rounded-full border-[1.5px] border-dashed border-line-off" />
                          <Text className="flex-1 text-[15px] text-ink-300">일행 {i + 1}</Text>
                          <View className="flex-row gap-1.5">
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setSheet('invite')}
                              className="h-[30px] justify-center rounded-badge bg-ink px-2.5"
                            >
                              <Text className="font-semibold text-xs text-white">초대</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setSheet('guest')}
                              className="h-[30px] justify-center rounded-badge border-[1.5px] border-line px-2.5"
                            >
                              <Text className="font-semibold text-xs text-ink">이름으로 추가</Text>
                            </Pressable>
                          </View>
                        </>
                      )}
                    </View>
                  ))}
                </View>
                <Text className="text-[13px] text-ink-500">
                  1인 {formatKrw(perPersonPreview(booking.paid_amount, booking.pax))}씩 나눠요. 동행은 자동으로 초대되지
                  않아요.
                </Text>
              </>
            ) : (
              <Text className="text-[13px] text-ink-500">{formatKrw(amount)}이 모두 내 몫으로 기록돼요.</Text>
            )}
          </View>
        )}
      </ScrollView>

      <BottomBar>
        <PrimaryButton title="장부로 가기" variant="dark" loading={busy} onPress={submit} />
      </BottomBar>

      <InviteSheet roomId={roomId} visible={sheet === 'invite'} onClose={() => setSheet(null)} />
      <BottomSheet visible={sheet === 'guest'} onClose={() => setSheet(null)} title="이름으로 추가">
        <GuestForm roomId={roomId} guest={null} onClose={() => setSheet(null)} />
      </BottomSheet>
    </SafeAreaView>
  );
}
