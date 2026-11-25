import { router, useLocalSearchParams } from 'expo-router';
import { Coins, Percentage, Settings, Wallet, WarningCircle } from 'iconoir-react-native';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import { Avatar, GuestChip } from '@/components/Avatar';
import { CATEGORY_ICON } from '@/components/categoryIcon';
import { Icon } from '@/components/Icon';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { BottomSheet } from '@/components/BottomSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks/useFeed';
import { usePoolDeposits, useSetPool, useUpsertPoolDeposits } from '@/hooks/usePool';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { categoryLabel } from '@/lib/category';
import { fillEqual, poolRemaining, refillPerPerson } from '@/lib/pool';
import type { FeedRow, Room } from '@/services/api';
import { colors } from '@/theme/tokens';
import type { MemberId, RoomMember } from '@/types/domain';
import { Input } from '@/components/Input';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');
const toKrw = (text: string) => Number(text.replace(/\D/g, '') || '0');
const INPUT = 'h-[54px] rounded-input border border-line bg-white px-4 font-semibold text-input-17 text-ink focus:border-primary';
// 시안 16 잔액 카드의 민트 계열 글자·트랙 색. 이 화면에서만 쓰여 토큰에 없다(프로토타입 인라인 값).
const MINT_DEEP = '#0A6656'; // TODO(token): 민트 800 #0A6656
const MINT_TRACK = 'rgba(11,125,108,.15)';

const mmdd = (iso: string) => iso.slice(5).replace('-', '.');
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

// 공금 지갑(J7). 공금 상계는 서버 room_balances가 한다. 여기서는 설정·입금 기록과 남은 공금 표시만.
export default function Pool() {
  // setup=1: 기록 화면의 '공금 지갑 설정하기'로 들어왔다 → 설정 시트를 바로 열고, 저장하면 기록 화면으로 돌아간다.
  const { roomId, setup } = useLocalSearchParams<{ roomId: string; setup?: string }>();
  const { data: room } = useRoom(roomId);
  const { data: members } = useRoomMembers(roomId);
  const { data: deposits } = usePoolDeposits(roomId);
  if (!room || !members || !deposits) return null;
  // 서버 값이 바뀌면(저장·Realtime) 폼을 새 값으로 다시 연다.
  const key = JSON.stringify([room.pool_enabled, room.pool_owner_member_id, room.pool_card_last4, deposits]);
  return <PoolForm key={key} room={room} members={members} deposits={deposits} fromRecord={setup === '1'} />;
}

type Deposit = { memberId: MemberId; amountKrw: number };

// 시안 16 잔액 카드. 진행 바는 모은 돈 대비 '남은' 비율이다(시안의 ¥18,400/¥40,000 = 46%).
function PoolBalance({
  remaining,
  collected,
  spent,
  settingsOpen,
  onToggleSettings,
}: {
  remaining: number;
  collected: number;
  spent: number;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  const pct = collected > 0 ? Math.max(0, Math.min(100, Math.round((remaining / collected) * 100))) : 0;
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
          hitSlop={8}
          // 시안: 평소 rgba(255,255,255,.7), hover 흰색.
          className="flex-row items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 active:bg-white"
        >
          <Icon as={Settings} size={14} color={colors.success.DEFAULT} />
          <Text className="font-semibold text-13 text-success">공금 설정</Text>
        </Pressable>
      </View>
      <Text
        style={{ fontVariant: ['tabular-nums'], color: remaining < 0 ? undefined : MINT_DEEP }}
        className={`font-semibold text-2xl leading-[1.3] ${remaining < 0 ? 'text-danger' : ''}`}
      >
        {remaining < 0 ? `−${formatKrw(-remaining)}` : formatKrw(remaining)}
      </Text>
      <View className="mr-16 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: MINT_TRACK }}>
        <View className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </View>
      <Text className="text-xs text-mint-700">
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
    <View className="rounded-card bg-white px-[18px] py-1.5">
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
          tint="bg-muted"
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
        <Text numberOfLines={1} className="font-semibold text-15 text-ink">
          {title}
        </Text>
        <Text className="text-xs text-ink-400">{meta}</Text>
      </View>
      <Text style={{ fontVariant: ['tabular-nums'] }} className={`font-semibold text-15 ${amountClass}`}>
        {amount}
      </Text>
    </View>
  );
}

function PoolForm({
  room,
  members,
  deposits,
  fromRecord,
}: {
  room: Room;
  members: RoomMember[];
  deposits: Deposit[];
  fromRecord: boolean;
}) {
  const roomId = room.id;
  const myId = useAuth().session?.user.id;
  const { data: feed = [] } = useFeed(roomId);
  const setPool = useSetPool(roomId);
  const upsert = useUpsertPoolDeposits(roomId);
  const toast = useToast();

  const active = members.filter((m) => !m.leftAt);
  const users = active.filter((m) => m.kind === 'user'); // 통장 주인 후보: 게스트 제외(ADR-011)
  const me = users.find((m) => m.userId === myId);

  const [owner, setOwner] = useState<MemberId | null>(room.pool_owner_member_id);
  const [cards, setCards] = useState(room.pool_card_last4.join(', '));
  const savedAmounts = () => Object.fromEntries(deposits.map((d) => [d.memberId, String(d.amountKrw)]));
  const [amounts, setAmounts] = useState<Record<MemberId, string>>(savedAmounts);
  const [bulk, setBulk] = useState('');

  const [settingsOpen, setSettingsOpen] = useState(fromRecord && !room.pool_enabled);
  // [더 모으기]로 연 시트: 1인 금액은 '기존 입금에 더할 돈'이다(공금 참여자에게만).
  const [refill, setRefill] = useState(false);

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
  // 공금 참여자 = 입금한 사람. 아직 아무도 안 냈으면 활동 참여자 전원.
  const depositorIds = deposits.filter((d) => d.amountKrw > 0).map((d) => d.memberId);
  const refillIds = depositorIds.length ? depositorIds : active.map((m) => m.id);
  const perRefill = refillPerPerson(-remaining, refillIds.length);
  const plus = (id: MemberId, amount: number) => String((deposits.find((d) => d.memberId === id)?.amountKrw ?? 0) + amount);
  const fillAll = (amount: number) =>
    setAmounts((a) => ({
      ...a,
      ...Object.fromEntries(
        refill
          ? refillIds.map((id) => [id, plus(id, amount)])
          : fillEqual(active.map((m) => m.id), amount).map((r) => [r.memberId, String(r.amountKrw)]),
      ),
    }));
  const openRefill = () => {
    setRefill(true);
    setBulk(String(perRefill));
    setAmounts({ ...savedAmounts(), ...Object.fromEntries(refillIds.map((id) => [id, plus(id, perRefill)])) });
    setSettingsOpen(true);
  };
  const closeSheet = () => {
    setSettingsOpen(false);
    if (!refill) return;
    setRefill(false);
    setAmounts(savedAmounts());
    setBulk('');
  };
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const colorIndex = new Map(members.map((m, i) => [m.id, i]));

  const save = async () => {
    if (!chosenOwner) return;
    try {
      const rows = active.map((m) => ({ memberId: m.id, amountKrw: toKrw(amounts[m.id] ?? '') }));
      await setPool.mutateAsync({ roomId, enabled: true, ownerMemberId: chosenOwner, cardLast4: cardList });
      // 켜는 저장에서도 입금을 같이 받는다(set_pool로 켜진 뒤라 upsert가 통과한다).
      await upsert.mutateAsync({ roomId, rows });
      setSettingsOpen(false);
      const added = sum(rows.map((r) => r.amountKrw)) - collected;
      if (refill && added > 0) toast(`공금을 ${formatKrw(added)} 더 모았어요`);
      if (!enabled && fromRecord) {
        toast('공금을 켰어요 · 이제 공금 결제를 고를 수 있어요');
        router.back();
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

  const form = (
    <>
        <View className="gap-2.5">
          <Text className="font-semibold text-sm text-ink-700">통장 주인</Text>
          <View className="flex-row flex-wrap gap-2">
            {users.map((u) => (
              <Pressable
                key={u.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosenOwner === u.id }}
                onPress={() => setOwner(u.id)}
                className={`h-10 items-center justify-center rounded-chip border px-4 ${
                  chosenOwner === u.id ? 'border-primary bg-primary' : 'border-line bg-white'
                }`}
              >
                <Text className={`font-semibold text-15 ${chosenOwner === u.id ? 'text-primary-on' : 'text-ink'}`}>
                  {u.userId === myId ? `${u.name}(나)` : u.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-semibold text-sm text-ink-700">
            공금 카드 끝자리<Text className="font-medium text-ink-300"> (선택)</Text>
          </Text>
          <Input
            accessibilityLabel="공금 카드 끝자리 4자리"
            placeholder="예: 1234, 5678"
            keyboardType="numbers-and-punctuation"
            value={cards}
            onChangeText={setCards}
            style={{ letterSpacing: 2 }}
            className={`${INPUT} focus:border-sky-500`}
          />
          <Text className="text-xs text-ink-400">승인 문자의 끝자리가 같으면 결제자가 &lsquo;공금&rsquo;으로 선택돼요</Text>
        </View>

        <View className="gap-2.5">
          <Text className="font-semibold text-sm text-ink-700">입금</Text>
          <View className="flex-row gap-2">
            <Input
              accessibilityLabel={refill ? '1인당 더 모을 금액' : '모두에게 같은 입금액'}
              placeholder="1인 금액"
              keyboardType="number-pad"
              value={bulk ? toKrw(bulk).toLocaleString('ko-KR') : ''}
              onChangeText={setBulk}
              style={{ fontVariant: ['tabular-nums'] }}
              className="h-[50px] flex-1 rounded-input border border-line bg-white px-3.5 font-semibold text-input-16 text-ink focus:border-sky-500"
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => fillAll(toKrw(bulk))}
              className="h-[50px] items-center justify-center rounded-input bg-sky-100 px-3.5"
            >
              <Text className="font-semibold text-sm text-primary-text">같은 금액 일괄 입력</Text>
            </Pressable>
          </View>
          <View className="rounded-card border border-card-line bg-white px-3.5">
            {active.map((m, i) => (
              <View key={m.id} className={`min-h-11 flex-row items-center gap-2.5 py-2.5 ${i > 0 ? 'border-t border-muted' : ''}`}>
                <Avatar name={m.name} colorIndex={colorIndex.get(m.id) ?? 0} guest={m.kind === 'guest'} size={36} />
                <View className="flex-1 flex-row items-center gap-2">
                  <Text className="shrink font-semibold text-15 text-ink" numberOfLines={1}>
                    {names[m.id]}
                  </Text>
                  {m.kind === 'guest' && <GuestChip />}
                </View>
                <Input
                  accessibilityLabel={`${m.name} 입금액`}
                  keyboardType="number-pad"
                  value={toKrw(amounts[m.id] ?? '') ? toKrw(amounts[m.id] ?? '').toLocaleString('ko-KR') : ''}
                  onChangeText={(t) => setAmounts((a) => ({ ...a, [m.id]: t }))}
                  placeholder="0"
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="h-[42px] w-[128px] rounded-chip bg-app px-3 text-right font-semibold text-input-15 text-ink"
                />
              </View>
            ))}
          </View>
          <View className="flex-row justify-between px-1">
            <Text className="text-sm text-ink-400">모은 돈 합계</Text>
            <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-sm text-success">
              {formatKrw(sum(active.map((m) => toKrw(amounts[m.id] ?? ''))))}
            </Text>
          </View>
        </View>

        {enabled && <PrimaryButton title="공금 끄기" variant="danger" size="md" disabled={busy} onPress={turnOff} />}
    </>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="공금 지갑" />
      {enabled ? (
        <ScrollView contentContainerClassName="gap-3 px-4 pt-1" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <PoolBalance
            remaining={remaining}
            collected={collected}
            spent={spent}
            settingsOpen={settingsOpen}
            onToggleSettings={() => setSettingsOpen((v) => !v)}
          />

          {/* 잔액 마이너스: 부족분을 공금 참여자 1/N(100원 단위 올림)로 채우자고 안내한다(노션 39번 ③) */}
          {remaining < 0 && (
            <View accessibilityRole="alert" className="flex-row items-center gap-2.5 rounded-box bg-danger-bg px-4 py-3.5">
              <Icon as={WarningCircle} size={20} color={colors.danger.DEFAULT} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-semibold text-sm text-ink">공금이 {formatKrw(-remaining)} 부족해요</Text>
                <Text className="text-xs text-ink-500">
                  {refillIds.length}명이 1인 {formatKrw(perRefill)}씩 채우면 돼요
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={openRefill}
                className="h-[34px] items-center justify-center rounded-button bg-white px-3 active:opacity-80"
              >
                <Text className="font-semibold text-13 text-danger">더 모으기</Text>
              </Pressable>
            </View>
          )}

          {(paid.length > 0 || poolSpends.length > 0) && (
            <PoolHistory spends={poolSpends} collected={collected} paid={paid} sameAmount={sameAmount} />
          )}
        </ScrollView>
      ) : (
        // 공금 꺼짐: 잔액 카드·내역 대신 빈 상태. [공금 설정하기] → 설정 시트, 저장하면 일반 공금 지갑 화면이 된다.
        <View className="flex-1 items-center justify-center gap-2.5 px-8 pb-20">
          <View className="mb-1.5 h-[72px] w-[72px] items-center justify-center rounded-full bg-mint-50">
            <Icon as={Wallet} size={34} color={colors.mint[600]} />
          </View>
          <Text className="font-semibold text-xl text-ink">아직 공금 지갑이 없어요</Text>
          <Text className="text-center text-15 text-ink-500">{'동행과 여행 경비를 모아 관리하고,\n공금으로 쓴 돈은 따로 기록해요.'}</Text>
          <View className="mt-2.5 gap-2 self-stretch rounded-box bg-app px-4 py-3.5">
            <View className="flex-row items-center gap-2">
              <Icon as={Coins} size={16} color={colors.mint[600]} />
              <Text className="text-13 text-ink-700">동행마다 모을 금액을 정해요</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Icon as={Percentage} size={16} color={colors.mint[600]} />
              <Text className="text-13 text-ink-700">공금이 부족하면 동행끼리 나눠 채워요</Text>
            </View>
          </View>
          <View className="mt-3.5 self-stretch">
            <PrimaryButton title="공금 설정하기" onPress={() => setSettingsOpen(true)} />
          </View>
        </View>
      )}

      {/* 설정은 시안 16대로 아래에서 올라오는 시트로 한다(켜기 전·후 공통) */}
      <BottomSheet visible={settingsOpen} onClose={closeSheet} title="공금 설정">
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
