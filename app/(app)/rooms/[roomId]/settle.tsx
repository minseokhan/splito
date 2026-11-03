import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { InviteSheet } from '@/components/InviteSheet';
import { SplitoMark } from '@/components/Logo';
import { formatKrw } from '@/components/Money';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { TransferCard, type Party } from '@/components/TransferCard';
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
import { formatForeign } from '@/lib/money';
import { poolNote, poolRemaining } from '@/lib/pool';
import {
  buildSettleItems,
  copyText,
  guestNoticeText,
  ledgerChangedAfterTransfer,
  settleHeadline,
  type SettleItem,
} from '@/lib/settleView';
import { uuidV4 } from '@/lib/uuid';
import type { PayoutAccount, PrivateExpenseRow } from '@/services/api';
import type { ExpenseId, MemberId, RoomId } from '@/types/domain';

const CLIPBOARD_NOTICE_KEY = 'clipboard_sync_notice_shown';
const CARD_SHADOW = { boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' };

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

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
  const [sendItem, setSendItem] = useState<SettleItem | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [picked, setPicked] = useState<'send' | 'recv' | null>(null);
  const privates = useMyPrivateExpenses(roomId);
  const [checkDone, setCheckDone] = useState(false);

  // 내가 대신 눌러주는 게스트(대표자). 게스트는 앱이 없어 직접 기록할 수 없다.
  const meId = plan.me?.id;
  const myGuests = useMemo(
    () => members.filter((m) => m.kind === 'guest' && !m.leftAt && m.representativeMemberId === meId).map((m) => m.id),
    [members, meId],
  );
  const items = useMemo(
    () => (plan.plan && meId ? buildSettleItems(plan.plan, records, meId, myGuests) : []),
    [plan.plan, records, meId, myGuests],
  );

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
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
        <NavBar title="정산" align="center" />
        <View className="flex-1 items-center justify-center gap-4 px-5">
          <SplitoMark size={64} />
          <Text className="text-center font-semibold text-xl text-ink">동행을 초대하면 정산을 할 수 있어요</Text>
          <View className="self-stretch">
            <PrimaryButton title="초대하기" onPress={() => setInviteOpen(true)} />
          </View>
        </View>
        <InviteSheet roomId={roomId} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
      </SafeAreaView>
    );
  }
  if (!plan.data || !plan.me || !plan.plan || privates.isPending) return <SafeAreaView className="flex-1 bg-white" />;

  const me = plan.me.id;
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const guestIds = new Set(members.filter((m) => m.kind === 'guest').map((m) => m.id));
  const colorIndex = Object.fromEntries(members.map((m, i) => [m.id, i]));
  const party = (id: MemberId): Party => ({
    name: names[id] ?? '',
    label: id === me ? '나' : (names[id] ?? ''),
    colorIndex: colorIndex[id] ?? 0,
    guest: guestIds.has(id),
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

  const busy = record.isPending || confirm.isPending || reject.isPending || cancel.isPending;
  const fxPending = plan.data.fxPendingCount;
  const changed = ledgerChangedAfterTransfer(records, lastChange);
  const head = settleHeadline(items);
  const tab = picked ?? (head.send || !head.recv ? 'send' : 'recv');
  const shown = items.filter((i) => i.dir === tab);
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

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
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
            <Text className="font-semibold text-[13px] text-primary-text">확인하기</Text>
          </Pressable>
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40, gap: 16 }}>
        <View className="flex-row items-center gap-3.5 px-1 pb-1 pt-1.5">
          <SplitoMark size={64} />
          <View className="flex-1 gap-1">
            <Text className="font-semibold text-xl text-ink">{head.title}</Text>
            <Text className="text-sm text-ink-500">{head.sub}</Text>
          </View>
        </View>

        {changed && (
          <View className="rounded-input bg-sky-100 px-4 py-3">
            <Text className="font-semibold text-[13px] text-primary-text">정산 후 장부가 변경되어 송금안이 갱신되었어요</Text>
          </View>
        )}

        <View className="flex-row gap-1.5 rounded-button bg-tab-bg p-[5px]">
          <Tab label="보낼 돈" count={head.send} on={tab === 'send'} onPress={() => setPicked('send')} />
          <Tab label="받을 돈" count={head.recv} on={tab === 'recv'} onPress={() => setPicked('recv')} />
        </View>

        {shown.length === 0 ? (
          <Text className="px-1 py-6 text-center text-sm text-ink-400">
            {tab === 'send' ? '보낼 돈이 없어요' : '받을 돈이 없어요'}
          </Text>
        ) : (
          shown.map((item) => (
            <CardContainer
              key={item.key}
              roomId={roomId}
              roomName={room?.name ?? ''}
              item={item}
              from={party(item.from)}
              to={party(item.to)}
              guestName={item.onBehalfOf ? (names[item.onBehalfOf] ?? '') : null}
              busy={busy}
              onSend={() => setSendItem(item)}
              onReceived={() =>
                item.transferId
                  ? confirm.mutate(item.transferId, { onError: showError })
                  : record.mutate(
                      { id: uuidV4(), roomId, from: item.from, to: item.to, amount: item.amount },
                      { onSuccess: () => toast('송금 기록을 남겼어요'), onError: showError },
                    )
              }
              onReject={() => item.transferId && reject.mutate(item.transferId, { onError: showError })}
              onCancel={() => item.transferId && cancel.mutate(item.transferId, { onError: showError })}
            />
          ))
        )}

        {poolText && <Text className="px-1 text-xs text-ink-400">{poolText}</Text>}
      </ScrollView>
      {sendItem && (
        <SendSheet
          item={sendItem}
          toName={names[sendItem.to] ?? ''}
          busy={record.isPending}
          onClose={() => setSendItem(null)}
          onSubmit={(id, amount) =>
            record.mutate(
              { id, roomId, from: sendItem.from, to: sendItem.to, amount },
              {
                onSuccess: () => {
                  setSendItem(null);
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

// 세그먼트 탭 한 칸. 선택되면 흰 배경 + 파란 숫자(핸드오프 settlement.html).
function Tab({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label} ${count}건`}
      onPress={onPress}
      style={on ? { boxShadow: '0 2px 8px -2px rgba(8,116,187,.18)' } : undefined}
      className={`h-[42px] flex-1 flex-row items-center justify-center gap-1.5 rounded-chip ${on ? 'bg-white' : ''}`}
    >
      <Text className={`font-semibold text-base ${on ? 'text-ink' : 'text-ink-400'}`}>{label}</Text>
      <Text className={`font-semibold text-base ${on ? 'text-tab-num' : 'text-tab-num-off'}`}>({count})</Text>
    </Pressable>
  );
}

type CardContainerProps = {
  roomId: RoomId;
  roomName: string;
  item: SettleItem;
  from: Party;
  to: Party;
  guestName: string | null; // 내가 대신 눌러주는 게스트 이름
  busy: boolean;
  onSend: () => void;
  onReceived: () => void;
  onReject: () => void;
  onCancel: () => void;
};

// 카드마다 계좌를 따로 조회한다(원문 여부는 서버가 판정).
function CardContainer({ roomId, roomName, item, from, to, guestName, busy, onSend, onReceived, onReject, onCancel }: CardContainerProps) {
  const toast = useToast();
  const { data: account } = usePayoutAccount(roomId, item.to);
  const requestAccount = useRequestPayoutAccount(roomId);
  const send = item.dir === 'send';

  const copy = async () => {
    if (!account?.accountNumber || !account.bankName) return;
    await Clipboard.setStringAsync(
      copyText({ toName: to.name, amount: item.amount, bankName: account.bankName, accountNumber: account.accountNumber }),
    );
    toast('받을 사람·금액·계좌를 복사했어요');
    if (!(await AsyncStorage.getItem(CLIPBOARD_NOTICE_KEY))) {
      await AsyncStorage.setItem(CLIPBOARD_NOTICE_KEY, '1');
      Alert.alert('복사했어요', '다른 기기와 클립보드가 동기화될 수 있어요');
    }
  };

  // 게스트는 앱이 없으므로 대표자가 금액을 카카오톡 등으로 보내 알려준다(OS 공유 시트).
  const share = () =>
    void Share.share({
      message: guestNoticeText({
        roomName,
        guestName: guestName ?? '',
        otherName: send ? to.name : from.name,
        dir: item.dir,
        amount: item.amount,
        account: accountForNotice(account),
      }),
    });

  return (
    <TransferCard
      item={item}
      from={from}
      to={to}
      account={account}
      busy={busy}
      shareLabel={guestName ? `${guestName}에게 알리기` : undefined}
      onShare={guestName ? share : undefined}
      onCopy={() => void copy()}
      onPrimary={send ? onSend : onReceived}
      onReject={onReject}
      onCancel={onCancel}
      onRequestAccount={() =>
        requestAccount.mutate(item.to, {
          onSuccess: () => toast(`${to.name}님께 계좌를 요청했어요`),
          onError: showError,
        })
      }
    />
  );
}

// 원문 계좌번호를 받은 경우에만 안내문에 계좌를 적는다.
function accountForNotice(a: PayoutAccount | undefined) {
  return a?.accountNumber && a.bankName && a.holderName
    ? { bankName: a.bankName, accountNumber: a.accountNumber, holderName: a.holderName }
    : null;
}

type SendSheetProps = {
  item: SettleItem;
  toName: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (id: string, amount: number) => void;
};

// [보냈어요] 금액 확인. 일부만 보냈으면 수정한다. id는 시트마다 하나라 재전송해도 1건이다.
function SendSheet({ item, toName, busy, onClose, onSubmit }: SendSheetProps) {
  const [id] = useState(uuidV4);
  const [text, setText] = useState(String(item.amount));
  const amount = Number(text.replace(/\D/g, '') || '0');
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={`${toName}님에게 보냈어요`}
      subtitle={`정산 금액 ${formatKrw(item.amount)} · 일부만 보냈으면 금액을 고쳐 주세요`}
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
          <SplitoMark size={64} />
          <Text className="flex-1 font-semibold text-xl text-ink">
            나만 보기로 저장된 지출 {rows.length}건 중 동행과 함께한 건 없나요?
          </Text>
        </View>
        {rows.map((r) => (
          <View key={r.id} className="gap-3 rounded-card bg-white p-4" style={CARD_SHADOW}>
            <View className="flex-row items-center gap-2">
              <View className="flex-1 gap-[3px]">
                <Text className="font-semibold text-base text-ink" numberOfLines={1}>
                  {r.merchant ?? '이름 없는 지출'}
                </Text>
                <Text className="text-[13px] text-ink-400">{dateTitle(r.paidLocalDate)}</Text>
              </View>
              <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-base text-ink">
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
        <Text className="px-1 text-[13px] text-ink-400">
          동행을 고르면 그 지출은 공동 지출이 되어 정산에 들어가요.
        </Text>
      </ScrollView>
      <View className="px-5 pb-2 pt-2">
        <PrimaryButton title="정산으로 넘어가기" loading={setScope.isPending} onPress={() => void submit()} />
      </View>
    </SafeAreaView>
  );
}
