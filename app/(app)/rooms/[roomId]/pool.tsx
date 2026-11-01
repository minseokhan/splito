import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, GuestChip } from '@/components/Avatar';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks/useFeed';
import { usePoolDeposits, useSetPool, useUpsertPoolDeposits } from '@/hooks/usePool';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { fillEqual, poolRemaining } from '@/lib/pool';
import type { Room } from '@/services/api';
import { colors } from '@/theme/tokens';
import type { MemberId, RoomMember } from '@/types/domain';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');
const toKrw = (text: string) => Number(text.replace(/\D/g, '') || '0');
const INPUT = 'h-[54px] rounded-input border-[1.5px] border-line bg-white px-4 font-semibold text-[17px] text-ink focus:border-primary';
const CARD_SHADOW = { boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' };

// 공금 지갑(J7). 공금 상계는 서버 room_balances가 한다. 여기서는 설정·입금 기록과 남은 공금 표시만.
export default function Pool() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { data: room } = useRoom(roomId);
  const { data: members } = useRoomMembers(roomId);
  const { data: deposits } = usePoolDeposits(roomId);
  if (!room || !members || !deposits) return null;
  // 서버 값이 바뀌면(저장·Realtime) 폼을 새 값으로 다시 연다.
  const key = JSON.stringify([room.pool_enabled, room.pool_owner_member_id, room.pool_card_last4, deposits]);
  return <PoolForm key={key} room={room} members={members} deposits={deposits} />;
}

type Deposit = { memberId: MemberId; amountKrw: number };

function PoolForm({ room, members, deposits }: { room: Room; members: RoomMember[]; deposits: Deposit[] }) {
  const roomId = room.id;
  const myId = useAuth().session?.user.id;
  const { data: feed = [] } = useFeed(roomId);
  const setPool = useSetPool(roomId);
  const upsert = useUpsertPoolDeposits(roomId);

  const active = members.filter((m) => !m.leftAt);
  const users = active.filter((m) => m.kind === 'user'); // 통장 주인 후보: 게스트 제외(ADR-011)
  const me = users.find((m) => m.userId === myId);

  const [owner, setOwner] = useState<MemberId | null>(room.pool_owner_member_id);
  const [cards, setCards] = useState(room.pool_card_last4.join(', '));
  const [amounts, setAmounts] = useState<Record<MemberId, string>>(() =>
    Object.fromEntries(deposits.map((d) => [d.memberId, String(d.amountKrw)])),
  );
  const [bulk, setBulk] = useState('');

  const enabled = room.pool_enabled;
  const busy = setPool.isPending || upsert.isPending;
  const cardList = cards.split(/[^0-9]+/).filter(Boolean);
  const chosenOwner = owner ?? me?.id ?? null;
  const remaining = poolRemaining(
    deposits.map((d) => d.amountKrw),
    feed.flatMap((r) => (r.payerKind === 'pool' && r.krwAmount !== null ? [r.krwAmount] : [])),
  );
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const colorIndex = new Map(members.map((m, i) => [m.id, i]));

  const save = async () => {
    if (!chosenOwner) return;
    try {
      await setPool.mutateAsync({ roomId, enabled: true, ownerMemberId: chosenOwner, cardLast4: cardList });
      if (enabled) {
        await upsert.mutateAsync({ roomId, rows: active.map((m) => ({ memberId: m.id, amountKrw: toKrw(amounts[m.id] ?? '') })) });
      }
    } catch (e) {
      showError(e);
    }
  };

  // 통장 주인을 바꾸면 과거 상계도 새 주인 기준으로 바뀐다(PRD §7.2).
  const onSave = () => {
    if (!enabled || !room.pool_owner_member_id || chosenOwner === room.pool_owner_member_id) return void save();
    Alert.alert('통장 주인을 바꿀까요?', '과거 상계도 새 주인 기준으로 바뀌어요', [
      { text: '취소', style: 'cancel' },
      { text: '바꾸기', onPress: () => void save() },
    ]);
  };

  const turnOff = () =>
    setPool.mutate({ roomId, enabled: false, ownerMemberId: null, cardLast4: [] }, { onError: showError });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-app">
      <NavBar title="공금 지갑" align="center" />
      <ScrollView
        contentContainerClassName="gap-[22px] px-5 pt-2"
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {enabled && (
          <View className="gap-0.5 rounded-[22px] bg-white p-5" style={CARD_SHADOW}>
            <Text className="font-semibold text-sm text-ink-500">남은 공금</Text>
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className={`font-semibold text-[28px] ${remaining < 0 ? 'text-danger' : 'text-ink'}`}
            >
              {remaining < 0 ? `−${formatKrw(-remaining)}` : formatKrw(remaining)}
            </Text>
            {remaining < 0 && <Text className="text-[13px] text-ink-500">부족한 공금</Text>}
          </View>
        )}

        <View className="gap-2.5">
          <Text className="px-1 font-semibold text-base text-ink">통장 주인</Text>
          <View className="flex-row flex-wrap gap-2">
            {users.map((u) => (
              <Pressable
                key={u.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosenOwner === u.id }}
                onPress={() => setOwner(u.id)}
                className={`h-11 items-center justify-center rounded-chip px-4 ${chosenOwner === u.id ? 'bg-primary' : 'bg-white'}`}
              >
                <Text className={`font-semibold text-base ${chosenOwner === u.id ? 'text-primary-on' : 'text-ink'}`}>
                  {u.userId === myId ? `${u.name}(나)` : u.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-2.5">
          <Text className="px-1 font-semibold text-base text-ink">공금 카드 끝자리(선택)</Text>
          <TextInput
            accessibilityLabel="공금 카드 끝자리 4자리"
            placeholder="예: 1234, 5678"
            placeholderTextColor={colors.ink[300]}
            keyboardType="numbers-and-punctuation"
            value={cards}
            onChangeText={setCards}
            className={INPUT}
          />
          <Text className="px-1 text-xs text-ink-400">승인 문자의 끝자리가 같으면 결제자가 &lsquo;공금&rsquo;으로 선택돼요</Text>
        </View>

        {enabled && (
          <View className="gap-2.5">
            <Text className="px-1 font-semibold text-base text-ink">입금</Text>
            <View className="flex-row gap-2">
              <TextInput
                accessibilityLabel="모두에게 같은 입금액"
                placeholder="1인 금액"
                placeholderTextColor={colors.ink[300]}
                keyboardType="number-pad"
                value={bulk ? toKrw(bulk).toLocaleString('ko-KR') : ''}
                onChangeText={setBulk}
                style={{ fontVariant: ['tabular-nums'] }}
                className={`flex-1 ${INPUT}`}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setAmounts(
                    Object.fromEntries(fillEqual(active.map((m) => m.id), toKrw(bulk)).map((r) => [r.memberId, String(r.amountKrw)])),
                  )
                }
                className="h-[54px] items-center justify-center rounded-input bg-sky-100 px-4 active:bg-sky-200"
              >
                <Text className="font-semibold text-base text-primary-text">같은 금액 일괄 입력</Text>
              </Pressable>
            </View>
            <View className="rounded-card bg-white px-4 py-1" style={CARD_SHADOW}>
              {active.map((m, i) => (
                <View key={m.id} className={`min-h-11 flex-row items-center gap-3 py-3 ${i > 0 ? 'border-t border-muted' : ''}`}>
                  <Avatar name={m.name} colorIndex={colorIndex.get(m.id) ?? 0} guest={m.kind === 'guest'} size={36} />
                  <View className="flex-1 flex-row items-center gap-2">
                    <Text className="shrink font-semibold text-base text-ink" numberOfLines={1}>
                      {names[m.id]}
                    </Text>
                    {m.kind === 'guest' && <GuestChip />}
                  </View>
                  <TextInput
                    accessibilityLabel={`${m.name} 입금액`}
                    keyboardType="number-pad"
                    value={toKrw(amounts[m.id] ?? '') ? toKrw(amounts[m.id] ?? '').toLocaleString('ko-KR') : ''}
                    onChangeText={(t) => setAmounts((a) => ({ ...a, [m.id]: t }))}
                    placeholder="0"
                    placeholderTextColor={colors.ink[300]}
                    style={{ fontVariant: ['tabular-nums'] }}
                    className="h-11 w-36 rounded-chip bg-app px-3 text-right font-semibold text-base text-ink focus:bg-sky-50"
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {enabled && <PrimaryButton title="공금 끄기" variant="danger" disabled={busy} onPress={turnOff} />}
      </ScrollView>
      <BottomBar bg={colors.app} fade>
        <PrimaryButton title={enabled ? '저장' : '공금 켜기'} disabled={busy || !chosenOwner} onPress={onSave} />
      </BottomBar>
    </SafeAreaView>
  );
}
