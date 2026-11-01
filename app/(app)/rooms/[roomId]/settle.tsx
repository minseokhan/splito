import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { BalanceTable } from '@/components/BalanceTable';
import { BottomSheet } from '@/components/BottomSheet';
import { SplitoSymbol } from '@/components/Logo';
import { InviteSheet } from '@/components/InviteSheet';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { TransferCard, TransferRecordRow, type Party } from '@/components/TransferCard';
import { useMyPrivateExpenses, useSetExpenseScope } from '@/hooks/useExpense';
import { useFeed, useReconfirmPendingFx } from '@/hooks/useFeed';
import { usePayoutAccount, useRequestPayoutAccount } from '@/hooks/usePayoutAccount';
import { usePoolDeposits } from '@/hooks/usePool';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import {
  useCancelTransfer,
  useConfirmTransfer,
  useLastExpenseChange,
  useRecordTransfer,
  useRejectTransfer,
  useSettlePlan,
  useTransfers,
} from '@/hooks/useSettlement';
import { dateTitle } from '@/lib/feed';
import { guestShareNote, orderBalanceRows } from '@/lib/guestView';
import { formatForeign } from '@/lib/money';
import { poolNote, poolRemaining } from '@/lib/pool';
import {
  copyText,
  ledgerChangedAfterTransfer,
  pendingConfirmSummary,
  recordState,
  type SettleCard,
  type TransferRecord,
} from '@/lib/settleView';
import { uuidV4 } from '@/lib/uuid';
import type { PrivateExpenseRow } from '@/services/api';
import type { ExpenseId, MemberId, RoomId } from '@/types/domain';

const CLIPBOARD_NOTICE_KEY = 'clipboard_sync_notice_shown';
const CARD_SHADOW = { boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' };

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

// 헤더 제목·상태 문구. '정산 완료' 판정은 서버만 하므로 여기서는 남은 송금·확인 대기만 말한다.
function headline(cards: SettleCard[], records: TransferRecord[], me: MemberId, names: Record<string, string>) {
  const sum = (cs: SettleCard[]) => formatKrw(cs.reduce((s, c) => s + c.amount, 0));
  const who = (ids: MemberId[]) => `${names[ids[0]] ?? ''}님${ids.length > 1 ? ` 외 ${ids.length - 1}명` : ''}`;
  const pay = cards.filter((c) => c.role === 'payer');
  const get = cards.filter((c) => c.role === 'payee');
  const mySent = records.filter((r) => r.from === me && recordState(r) === 'pending');
  const summary = pendingConfirmSummary(records, names);
  const sub = pay.length
    ? `나는 ${who(pay.map((c) => c.to))}에게 ${sum(pay)} 보내면 돼요`
    : get.length
      ? `나는 ${who(get.map((c) => c.from))}에게서 ${sum(get)} 받으면 돼요`
      : mySent.length
        ? `${who(mySent.map((r) => r.to))}이 확인하면 정산 완료예요`
        : (summary ?? (cards.length ? `남은 송금 ${cards.length}건이에요` : '모든 송금이 정리됐어요'));
  const title = cards.length
    ? `송금 ${cards.length}번이면 끝나요`
    : summary
      ? '송금을 모두 기록했어요'
      : '정산할 돈이 없어요';
  return { title, sub };
}

export default function Settle() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const toast = useToast();
  const plan = useSettlePlan(roomId);
  const { data: members = [] } = useRoomMembers(roomId);
  const { data: records = [] } = useTransfers(roomId);
  const { data: lastChange = null } = useLastExpenseChange(roomId);
  const feed = useFeed(roomId);
  const { data: room } = useRoom(roomId);
  const { data: deposits = [] } = usePoolDeposits(roomId);
  const reconfirm = useReconfirmPendingFx(roomId);
  const record = useRecordTransfer(roomId);
  const confirm = useConfirmTransfer(roomId);
  const reject = useRejectTransfer(roomId);
  const cancel = useCancelTransfer(roomId);
  const [sendCard, setSendCard] = useState<SettleCard | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const privates = useMyPrivateExpenses(roomId);
  const [checkDone, setCheckDone] = useState(false);

  // 진입 시 1회: 환율 대기 지출을 fx-rate로 캐시한 뒤 서버가 재확정한다.
  const triedFx = useRef(false);
  useEffect(() => {
    if (triedFx.current || !feed.data) return;
    triedFx.current = true;
    const pending = feed.data.filter((r) => r.krwAmount === null);
    if (pending.length) reconfirm.mutate(pending);
  }, [feed.data, reconfirm]);

  const active = members.filter((m) => !m.leftAt);
  if (members.length && active.length < 2) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-app">
        <NavBar title="정산" align="center" />
        <View className="flex-1 items-center justify-center gap-4 px-5">
          <SplitoSymbol size={64} blush />
          <Text className="text-center font-bold text-[20px] text-ink">동행을 초대하면 정산을 할 수 있어요</Text>
          <View className="self-stretch">
            <PrimaryButton title="초대하기" onPress={() => setInviteOpen(true)} />
          </View>
        </View>
        <InviteSheet roomId={roomId} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
      </SafeAreaView>
    );
  }
  if (!plan.data || !plan.me || !plan.cards || privates.isPending) return <SafeAreaView className="flex-1 bg-app" />;

  const me = plan.me.id;
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const colorIndex = Object.fromEntries(members.map((m, i) => [m.id, i]));
  const party = (id: MemberId): Party => ({
    name: names[id] ?? '',
    label: id === me ? '나' : (names[id] ?? ''),
    colorIndex: colorIndex[id] ?? 0,
  });
  // 정산 직전 마지막 안전망(명세 4). 나만 보기가 0건이면 이 단계는 뜨지 않는다.
  if (!checkDone && privates.data?.length) {
    return (
      <PrivateCheckStep
        roomId={roomId}
        rows={privates.data}
        me={me}
        companions={members.filter((m) => !m.leftAt && m.id !== me).map((m) => ({
          id: m.id,
          name: m.name,
          guest: m.kind === 'guest',
          colorIndex: colorIndex[m.id] ?? 0,
        }))}
        onDone={() => setCheckDone(true)}
      />
    );
  }

  const rows = plan.data.rows;
  const shareNote = (c: SettleCard) =>
    [guestShareNote(c.from, rows, names), guestShareNote(c.to, rows, names)].filter(Boolean).join(' · ') || undefined;
  const busy = record.isPending || confirm.isPending || reject.isPending || cancel.isPending;
  const fxPending = plan.data.fxPendingCount;
  const changed = ledgerChangedAfterTransfer(records, lastChange);
  const head = headline(plan.cards, records, me, names);
  // 확인 대기 기록을 먼저, 나머지는 받은 순서대로.
  const sortedRecords = [
    ...records.filter((r) => recordState(r) === 'pending'),
    ...records.filter((r) => recordState(r) !== 'pending'),
  ];
  // 공금은 송금 대상이 아니다. 남은 공금은 통장 주인 순잔액에 이미 합쳐져 있어 설명만 붙인다(J7 3번).
  const poolOwner = room?.pool_enabled ? room.pool_owner_member_id : null;
  const poolText = poolOwner
    ? poolNote(
        poolRemaining(
          deposits.map((d) => d.amountKrw),
          (feed.data ?? []).flatMap((r) => (r.payerKind === 'pool' && r.krwAmount !== null ? [r.krwAmount] : [])),
        ),
        names[poolOwner] ?? '',
      )
    : null;
  const poolCard = poolText ? plan.cards.find((c) => c.from === poolOwner || c.to === poolOwner) : undefined;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-app">
      <NavBar title="정산" align="center" />
      {fxPending > 0 && (
        <View className="flex-row items-center justify-between border-b border-warning-line bg-warning-banner px-5 py-2">
          <Text className="flex-1 font-semibold text-[13px] text-warning-deep">
            환율 대기 {fxPending}건 제외 · 잠정 정산이에요
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate({ pathname: '/rooms/[roomId]', params: { roomId } })}
            className="h-11 justify-center pl-3"
          >
            <Text className="font-bold text-[13px] text-primary-text">확인하기</Text>
          </Pressable>
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40, gap: 16 }}>
        <View className="flex-row items-center gap-3.5 px-1 pb-1 pt-1.5">
          <SplitoSymbol size={64} blush />
          <View className="flex-1 gap-1">
            <Text style={{ letterSpacing: -0.44 }} className="font-extrabold text-[22px] text-ink">
              {head.title}
            </Text>
            <Text className="text-sm text-ink-500">{head.sub}</Text>
          </View>
        </View>

        {changed && (
          <View className="rounded-input bg-sky-100 px-4 py-3">
            <Text className="font-semibold text-[13px] text-primary-text">정산 후 장부가 변경되어 송금안이 갱신되었어요</Text>
          </View>
        )}

        {plan.cards.map((c) => (
          <View key={`${c.from}-${c.to}`} className="gap-2">
            <CardContainer
              roomId={roomId}
              card={c}
              from={party(c.from)}
              to={party(c.to)}
              guestNote={shareNote(c)}
              rejected={records.some((r) => r.from === c.from && r.to === c.to && recordState(r) === 'not_received')}
              busy={busy}
              onSend={() => setSendCard(c)}
              onReceived={() =>
                record.mutate(
                  { id: uuidV4(), roomId, from: c.from, to: me, amount: c.amount },
                  { onSuccess: () => toast('송금 기록을 남겼어요'), onError: showError },
                )
              }
            />
            {c === poolCard && <Text className="px-1 text-xs leading-[18px] text-ink-400">{poolText}</Text>}
          </View>
        ))}
        {poolText && !poolCard && <Text className="px-1 text-xs leading-[18px] text-ink-400">{poolText}</Text>}

        {sortedRecords.map((r) => {
          const pending = recordState(r) === 'pending';
          return (
            <TransferRecordRow
              key={r.id}
              from={party(r.from)}
              to={party(r.to)}
              amount={r.amount}
              state={recordState(r)}
              busy={busy}
              onConfirm={pending && r.to === me ? () => confirm.mutate(r.id, { onError: showError }) : undefined}
              onReject={pending && r.to === me ? () => reject.mutate(r.id, { onError: showError }) : undefined}
              onCancel={pending && r.from === me ? () => cancel.mutate(r.id, { onError: showError }) : undefined}
            />
          );
        })}

        <BalanceTable rows={orderBalanceRows(rows)} names={names} colorIndex={colorIndex} />
      </ScrollView>
      {sendCard && (
        <SendSheet
          card={sendCard}
          toName={names[sendCard.to] ?? ''}
          busy={record.isPending}
          onClose={() => setSendCard(null)}
          onSubmit={(id, amount) =>
            record.mutate(
              { id, roomId, from: me, to: sendCard.to, amount },
              {
                onSuccess: () => {
                  setSendCard(null);
                  toast('송금 기록을 남겼어요');
                },
                onError: showError,
              },
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

type CardContainerProps = {
  roomId: RoomId;
  card: SettleCard;
  from: Party;
  to: Party;
  guestNote?: string;
  rejected: boolean;
  busy: boolean;
  onSend: () => void;
  onReceived: () => void;
};

// 카드마다 계좌를 따로 조회한다(원문 여부는 서버가 판정).
function CardContainer({ roomId, card, from, to, guestNote, rejected, busy, onSend, onReceived }: CardContainerProps) {
  const toast = useToast();
  const { data: account } = usePayoutAccount(roomId, card.to);
  const requestAccount = useRequestPayoutAccount(roomId);

  const copy = async () => {
    if (!account?.accountNumber || !account.bankName) return;
    await Clipboard.setStringAsync(
      copyText({ toName: to.name, amount: card.amount, bankName: account.bankName, accountNumber: account.accountNumber }),
    );
    toast('받을 사람·금액·계좌를 복사했어요');
    if (!(await AsyncStorage.getItem(CLIPBOARD_NOTICE_KEY))) {
      await AsyncStorage.setItem(CLIPBOARD_NOTICE_KEY, '1');
      Alert.alert('복사했어요', '다른 기기와 클립보드가 동기화될 수 있어요');
    }
  };

  return (
    <TransferCard
      from={from}
      to={to}
      amount={card.amount}
      role={card.role}
      account={account}
      guestNote={guestNote}
      note={rejected && card.role === 'payer' ? '받지 못했다고 표시했어요' : undefined}
      busy={busy}
      onCopy={() => void copy()}
      onSend={onSend}
      onReceived={onReceived}
      onRequestAccount={() =>
        requestAccount.mutate(card.to, {
          onSuccess: () => toast(`${to.name}님께 계좌를 요청했어요`),
          onError: showError,
        })
      }
    />
  );
}

type SendSheetProps = {
  card: SettleCard;
  toName: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (id: string, amount: number) => void;
};

// [보냈어요] 금액 확인. 일부만 보냈으면 수정한다. id는 시트마다 하나라 재전송해도 1건이다.
function SendSheet({ card, toName, busy, onClose, onSubmit }: SendSheetProps) {
  const [id] = useState(uuidV4);
  const [text, setText] = useState(String(card.amount));
  const amount = Number(text.replace(/\D/g, '') || '0');
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={`${toName}님에게 보냈어요`}
      subtitle={`정산 금액 ${formatKrw(card.amount)} · 일부만 보냈으면 금액을 고쳐 주세요`}
    >
      <TextInput
        accessibilityLabel="보낸 금액"
        keyboardType="number-pad"
        value={amount ? amount.toLocaleString('ko-KR') : ''}
        onChangeText={setText}
        style={{ fontVariant: ['tabular-nums'] }}
        className="h-[54px] rounded-input border-[1.5px] border-line bg-white px-4 font-semibold text-[17px] text-ink focus:border-primary focus:bg-sky-50"
      />
      <PrimaryButton title="기록하기" variant="dark" loading={busy} disabled={amount <= 0} onPress={() => onSubmit(id, amount)} />
    </BottomSheet>
  );
}

type PrivateCheckProps = {
  roomId: RoomId;
  rows: PrivateExpenseRow[];
  me: MemberId;
  companions: { id: MemberId; name: string; guest: boolean; colorIndex: number }[];
  onDone: () => void;
};

// 정산 전 확인 단계(명세 4). 고른 동행을 대상 인원에 더해 저장하면 서버가 공동 지출로 다시 판정한다.
// '공개로 바꾸기' 같은 별도 플래그는 두지 않는다(AI-12). 저장은 넘어갈 때 한 번에 한다
// (칩마다 저장하면 그 줄이 '나만 보기' 목록에서 빠져 나머지 동행을 고를 수 없다).
function PrivateCheckStep({ roomId, rows, me, companions, onDone }: PrivateCheckProps) {
  const setScope = useSetExpenseScope(roomId);
  const [picked, setPicked] = useState<Record<ExpenseId, MemberId[]>>({});

  const toggle = (id: ExpenseId, memberId: MemberId) =>
    setPicked((p) => {
      const cur = p[id] ?? [];
      return { ...p, [id]: cur.includes(memberId) ? cur.filter((m) => m !== memberId) : [...cur, memberId] };
    });

  const submit = async () => {
    try {
      for (const [id, ids] of Object.entries(picked)) {
        if (ids.length) await setScope.mutateAsync({ id, scopeMemberIds: [me, ...ids] });
      }
      onDone();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-app">
      <NavBar title="정산" align="center" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 12 }}>
        <View className="flex-row items-center gap-3.5 px-1 pb-1 pt-1.5">
          <SplitoSymbol size={64} blush />
          <Text style={{ letterSpacing: -0.44 }} className="flex-1 font-extrabold text-[19px] leading-[26px] text-ink">
            나만 보기로 저장된 지출 {rows.length}건 중 동행과 함께한 건 없나요?
          </Text>
        </View>
        {rows.map((r) => (
          <View key={r.id} className="gap-3 rounded-card bg-white p-4" style={CARD_SHADOW}>
            <View className="flex-row items-center gap-2">
              <View className="flex-1 gap-[3px]">
                <Text className="font-bold text-base text-ink" numberOfLines={1}>
                  {r.merchant ?? '이름 없는 지출'}
                </Text>
                <Text className="text-[13px] text-ink-400">{dateTitle(r.paidLocalDate)}</Text>
              </View>
              <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-base text-ink">
                {r.krwAmount === null ? formatForeign(r.amountOriginal, r.currency) : formatKrw(r.krwAmount)}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-3">
              {companions.map((p) => {
                const on = (picked[r.id] ?? []).includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`동행 ${p.name}`}
                    disabled={setScope.isPending}
                    onPress={() => toggle(r.id, p.id)}
                    className={`min-h-11 items-center gap-1 ${on ? '' : 'opacity-40'}`}
                  >
                    <Avatar name={p.name} colorIndex={p.colorIndex} guest={p.guest} size={36} />
                    <Text className="font-medium text-xs text-ink-700">{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <Text className="px-1 text-[13px] leading-[19px] text-ink-400">
          동행을 고르면 그 지출은 공동 지출이 되어 정산에 들어가요.
        </Text>
      </ScrollView>
      <View className="px-5 pb-2 pt-2">
        <PrimaryButton title="정산으로 넘어가기" loading={setScope.isPending} onPress={() => void submit()} />
      </View>
    </SafeAreaView>
  );
}
