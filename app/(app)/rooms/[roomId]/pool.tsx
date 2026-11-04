import { useLocalSearchParams } from 'expo-router';
import { Coins, Settings, Wallet } from 'iconoir-react-native';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import { Avatar, GuestChip } from '@/components/Avatar';
import { CATEGORY_ICON } from '@/components/categoryIcon';
import { Icon } from '@/components/Icon';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { BottomSheet } from '@/components/BottomSheet';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks/useFeed';
import { usePoolDeposits, useSetPool, useUpsertPoolDeposits } from '@/hooks/usePool';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { categoryLabel } from '@/lib/category';
import { fillEqual, poolRemaining } from '@/lib/pool';
import type { FeedRow, Room } from '@/services/api';
import { colors } from '@/theme/tokens';
import type { MemberId, RoomMember } from '@/types/domain';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');
const toKrw = (text: string) => Number(text.replace(/\D/g, '') || '0');
const INPUT = 'h-[54px] rounded-input border-[1.5px] border-line bg-white px-4 font-semibold text-[17px] text-ink focus:border-primary';
const CARD_SHADOW = { boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' };
// 시안 16 잔액 카드의 민트 계열 글자·트랙 색. 이 화면에서만 쓰여 토큰에 없다(프로토타입 인라인 값).
const MINT_DEEP = '#0B3B33';
const MINT_SOFT = '#4E7A72';
const MINT_TRACK = 'rgba(11,125,108,.15)';

const mmdd = (iso: string) => iso.slice(5).replace('-', '.');
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

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

// 시안 16 잔액 카드. 진행 바는 모은 돈 대비 '남은' 비율이다(시안의 ¥18,400/¥40,000 = 46%).
function PoolBalance({
  remaining,
  collected,
  spent,
  paid,
  sameAmount,
  settingsOpen,
  onToggleSettings,
}: {
  remaining: number;
  collected: number;
  spent: number;
  paid: number[];
  sameAmount: boolean;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  const pct = collected > 0 ? Math.max(0, Math.min(100, Math.round((remaining / collected) * 100))) : 0;
  // 시안의 '동행 모두 같은 금액'은 실제로 금액이 같을 때만 사실이다.
  const caption = paid.length === 0 ? '아직 입금 없음' : sameAmount ? '동행 모두 같은 금액' : `${paid.length}명 입금`;
  return (
    <View className="gap-2.5 rounded-card bg-success-bg px-5 py-[18px]">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Wallet} size={18} color={colors.success.DEFAULT} />
          <Text className="font-semibold text-sm text-success">공금 잔액</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: settingsOpen }}
          onPress={onToggleSettings}
          hitSlop={6}
          className="h-[30px] flex-row items-center gap-1 rounded-full bg-white px-2.5 active:opacity-70"
        >
          <Icon as={Settings} size={14} color={colors.success.DEFAULT} />
          <Text className="font-semibold text-[13px] text-success">공금 설정</Text>
        </Pressable>
      </View>
      <Text className="-mt-1.5 text-xs text-success">{caption}</Text>
      <Text
        style={{ fontVariant: ['tabular-nums'], color: remaining < 0 ? undefined : MINT_DEEP }}
        className={`font-semibold text-[26px] ${remaining < 0 ? 'text-danger' : ''}`}
      >
        {remaining < 0 ? `−${formatKrw(-remaining)}` : formatKrw(remaining)}
      </Text>
      <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: MINT_TRACK }}>
        <View className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </View>
      <Text className="text-xs" style={{ color: MINT_SOFT }}>
        {remaining < 0 ? '부족한 공금 · ' : ''}모은 돈 {formatKrw(collected)} · 쓴 돈 {formatKrw(spent)}
      </Text>
    </View>
  );
}

// 시안 16 공금 내역. 모으기(+, 민트) 한 줄 + 공금 결제 지출(−).
function PoolHistory({
  spends,
  collected,
  paid,
  sameAmount,
}: {
  spends: FeedRow[];
  collected: number;
  paid: number[];
  sameAmount: boolean;
}) {
  return (
    <View className="rounded-card bg-white px-[18px] py-1.5" style={CARD_SHADOW}>
      <Text className="pb-1 pt-2.5 font-semibold text-sm text-ink-500">공금 내역</Text>
      {paid.length > 0 && (
        <PoolRow
          icon={Coins}
          tint="bg-success-badge"
          iconColor={colors.success.DEFAULT}
          title="공금 모으기"
          meta={sameAmount ? `${paid.length}명 × ${formatKrw(paid[0])}` : `${paid.length}명`}
          amount={`+${formatKrw(collected)}`}
          amountClass="text-success"
          first
        />
      )}
      {spends.map((r, i) => (
        <PoolRow
          key={r.id}
          icon={CATEGORY_ICON[r.category]}
          tint="bg-sky-100"
          iconColor={colors.primary.text}
          title={r.merchant ?? categoryLabel(r.category)}
          meta={mmdd(r.paidLocalDate)}
          amount={r.krwAmount === null ? '환율 대기' : `−${formatKrw(r.krwAmount)}`}
          amountClass={r.krwAmount === null ? 'text-ink-400' : 'text-ink'}
          first={paid.length === 0 && i === 0}
        />
      ))}
    </View>
  );
}

function PoolRow({
  icon,
  tint,
  iconColor,
  title,
  meta,
  amount,
  amountClass,
  first,
}: {
  icon: ComponentType<SvgProps>;
  tint: string;
  iconColor: string;
  title: string;
  meta: string;
  amount: string;
  amountClass: string;
  first?: boolean;
}) {
  return (
    <View className={`flex-row items-center gap-3 py-[11px] ${first ? '' : 'border-t border-muted'}`}>
      <View className={`h-9 w-9 items-center justify-center rounded-chip ${tint}`}>
        <Icon as={icon} size={18} color={iconColor} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-semibold text-base text-ink">
          {title}
        </Text>
        <Text className="text-xs text-ink-400">{meta}</Text>
      </View>
      <Text style={{ fontVariant: ['tabular-nums'] }} className={`font-semibold text-base ${amountClass}`}>
        {amount}
      </Text>
    </View>
  );
}

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

  const [settingsOpen, setSettingsOpen] = useState(false);

  const enabled = room.pool_enabled;
  const busy = setPool.isPending || upsert.isPending;
  const cardList = cards.split(/[^0-9]+/).filter(Boolean);
  const chosenOwner = owner ?? me?.id ?? null;
  const poolSpends = feed.filter((r) => r.payerKind === 'pool');
  const remaining = poolRemaining(
    deposits.map((d) => d.amountKrw),
    poolSpends.flatMap((r) => (r.krwAmount !== null ? [r.krwAmount] : [])),
  );
  // 입금 합계와 쓴 돈. 환율 대기 지출은 아직 원화가 없어 쓴 돈에 들어가지 않는다(목록에는 '환율 대기'로 보인다).
  const collected = sum(deposits.map((d) => d.amountKrw));
  const spent = collected - remaining;
  const paid = deposits.map((d) => d.amountKrw).filter((a) => a > 0);
  const sameAmount = paid.length > 1 && paid.every((a) => a === paid[0]);
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const colorIndex = new Map(members.map((m, i) => [m.id, i]));

  const save = async () => {
    if (!chosenOwner) return;
    try {
      await setPool.mutateAsync({ roomId, enabled: true, ownerMemberId: chosenOwner, cardLast4: cardList });
      if (enabled) {
        await upsert.mutateAsync({ roomId, rows: active.map((m) => ({ memberId: m.id, amountKrw: toKrw(amounts[m.id] ?? '') })) });
      }
      setSettingsOpen(false);
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

  const form = (
    <>
        <View className="gap-2.5">
          <Text className="px-1 font-semibold text-base text-ink">통장 주인</Text>
          <View className="flex-row flex-wrap gap-2">
            {users.map((u) => (
              <Pressable
                key={u.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosenOwner === u.id }}
                onPress={() => setOwner(u.id)}
                className={`h-11 items-center justify-center rounded-chip border-[1.5px] px-4 ${
                  chosenOwner === u.id ? 'border-primary bg-primary' : 'border-line bg-white'
                }`}
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
                    className="h-11 w-[104px] rounded-chip bg-app px-2.5 text-right font-semibold text-[16px] text-ink focus:bg-sky-50"
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {enabled && <PrimaryButton title="공금 끄기" variant="danger" size="md" disabled={busy} onPress={turnOff} />}
    </>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-app">
      <NavBar title="공금 지갑" align="center" />
      <ScrollView
        contentContainerClassName="gap-[22px] px-5 pt-2"
        contentContainerStyle={{ paddingBottom: enabled ? 40 : 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {enabled && (
          <PoolBalance
            remaining={remaining}
            collected={collected}
            spent={spent}
            paid={paid}
            sameAmount={sameAmount}
            settingsOpen={settingsOpen}
            onToggleSettings={() => setSettingsOpen((v) => !v)}
          />
        )}

        {enabled && (paid.length > 0 || poolSpends.length > 0) && (
          <PoolHistory spends={poolSpends} collected={collected} paid={paid} sameAmount={sameAmount} />
        )}

        {/* 공금이 꺼져 있을 때는 이 화면 자체가 '공금 켜기' 설정 화면이다 */}
        {!enabled && form}
      </ScrollView>
      {!enabled && (
        <BottomBar bg={colors.app} fade>
          <PrimaryButton title="공금 켜기" disabled={busy || !chosenOwner} onPress={onSave} />
        </BottomBar>
      )}

      {/* 켜진 뒤 설정 변경은 시안 16대로 아래에서 올라오는 시트로 한다 */}
      <BottomSheet visible={enabled && settingsOpen} onClose={() => setSettingsOpen(false)} title="공금 설정">
        <ScrollView
          style={{ maxHeight: 420 }}
          contentContainerClassName="gap-[22px] pb-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {form}
        </ScrollView>
        <PrimaryButton title="저장" variant="dark" disabled={busy || !chosenOwner} onPress={onSave} />
      </BottomSheet>
    </SafeAreaView>
  );
}
