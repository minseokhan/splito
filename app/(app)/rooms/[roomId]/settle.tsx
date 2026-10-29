import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BalanceTable } from '@/components/BalanceTable';
import { BottomSheet } from '@/components/BottomSheet';
import { formatKrw } from '@/components/Money';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TransferCard, TransferRecordRow } from '@/components/TransferCard';
import { useFeed, useReconfirmPendingFx } from '@/hooks/useFeed';
import { usePayoutAccount, useRequestPayoutAccount } from '@/hooks/usePayoutAccount';
import { useRoomMembers } from '@/hooks/useRooms';
import {
  useCancelTransfer,
  useConfirmTransfer,
  useLastExpenseChange,
  useRecordTransfer,
  useRejectTransfer,
  useSettlePlan,
  useTransfers,
} from '@/hooks/useSettlement';
import { copyText, ledgerChangedAfterTransfer, pendingConfirmSummary, recordState, type SettleCard } from '@/lib/settleView';
import { uuidV4 } from '@/lib/uuid';
import type { MemberId, RoomId } from '@/types/domain';

const CLIPBOARD_NOTICE_KEY = 'clipboard_sync_notice_shown';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

export default function Settle() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const plan = useSettlePlan(roomId);
  const { data: members = [] } = useRoomMembers(roomId);
  const { data: records = [] } = useTransfers(roomId);
  const { data: lastChange = null } = useLastExpenseChange(roomId);
  const feed = useFeed(roomId);
  const reconfirm = useReconfirmPendingFx(roomId);
  const record = useRecordTransfer(roomId);
  const confirm = useConfirmTransfer(roomId);
  const reject = useRejectTransfer(roomId);
  const cancel = useCancelTransfer(roomId);
  const [sendCard, setSendCard] = useState<SettleCard | null>(null);

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
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-white px-5">
        <Text className="text-center text-[15px] text-ink-700">동행을 초대하면 정산을 할 수 있어요</Text>
        <View className="self-stretch">
          <PrimaryButton
            title="초대하기"
            onPress={() => router.push({ pathname: '/rooms/[roomId]/invite', params: { roomId } })}
          />
        </View>
      </SafeAreaView>
    );
  }
  if (!plan.data || !plan.me || !plan.cards) return null;

  const me = plan.me.id;
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const colorIndex = Object.fromEntries(members.map((m, i) => [m.id, i]));
  const guestsOf = (id: MemberId) =>
    members.filter((m) => m.kind === 'guest' && m.representativeMemberId === id).map((m) => m.name);
  const busy = record.isPending || confirm.isPending || reject.isPending || cancel.isPending;
  const fxPending = plan.data.fxPendingCount;
  const summary = pendingConfirmSummary(records, names);
  const changed = ledgerChangedAfterTransfer(records, lastChange);

  return (
    <SafeAreaView className="flex-1 bg-white">
      {fxPending > 0 && (
        <View className="flex-row items-center justify-between bg-pending-bg px-5 py-2">
          <Text className="flex-1 text-[13px] text-pending-fg">환율 대기 {fxPending}건 제외 · 잠정 정산이에요</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate({ pathname: '/rooms/[roomId]', params: { roomId } })}
            className="h-11 justify-center pl-3"
          >
            <Text className="font-medium text-[13px] text-sky-900">확인하기</Text>
          </Pressable>
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 8 }}>
        <Text className="mb-2 mt-6 font-bold text-[22px] text-ink-900">정산</Text>
        <Text className="mb-2 font-semibold text-[17px] text-ink-900">사람별</Text>
        <BalanceTable rows={plan.data.rows} names={names} colorIndex={colorIndex} />

        <Text className="mb-2 mt-6 font-semibold text-[17px] text-ink-900">송금</Text>
        {plan.cards.length === 0 && <Text className="text-[15px] text-ink-700">남은 송금이 없어요</Text>}
        {plan.cards.map((c) => (
          <CardContainer
            key={`${c.from}-${c.to}`}
            roomId={roomId}
            card={c}
            names={names}
            guestNote={[...guestsOf(c.from), ...guestsOf(c.to)].map((n) => `${n} 몫 포함`).join(' · ') || undefined}
            rejected={records.some((r) => r.from === c.from && r.to === c.to && recordState(r) === 'not_received')}
            busy={busy}
            onSend={() => setSendCard(c)}
            onReceived={() =>
              record.mutate({ id: uuidV4(), roomId, from: c.from, to: me, amount: c.amount }, { onError: showError })
            }
          />
        ))}

        {records.length > 0 && (
          <>
            <Text className="mb-2 mt-6 font-semibold text-[17px] text-ink-900">송금 기록</Text>
            {records.map((r) => {
              const pending = recordState(r) === 'pending';
              return (
                <TransferRecordRow
                  key={r.id}
                  fromName={names[r.from] ?? ''}
                  toName={names[r.to] ?? ''}
                  amount={r.amount}
                  state={recordState(r)}
                  busy={busy}
                  onConfirm={pending && r.to === me ? () => confirm.mutate(r.id, { onError: showError }) : undefined}
                  onReject={pending && r.to === me ? () => reject.mutate(r.id, { onError: showError }) : undefined}
                  onCancel={pending && r.from === me ? () => cancel.mutate(r.id, { onError: showError }) : undefined}
                />
              );
            })}
          </>
        )}

        {summary && <Text className="mt-4 text-[13px] text-ink-500">{summary}</Text>}
        {changed && (
          <View className="mt-2 rounded-lg bg-sky-200 px-4 py-3">
            <Text className="text-[13px] text-ink-900">정산 후 장부가 변경되어 송금안이 갱신되었어요</Text>
          </View>
        )}
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
              { onSuccess: () => setSendCard(null), onError: showError },
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
  names: Record<string, string>;
  guestNote?: string;
  rejected: boolean;
  busy: boolean;
  onSend: () => void;
  onReceived: () => void;
};

// 카드마다 계좌를 따로 조회한다(원문 여부는 서버가 판정).
function CardContainer({ roomId, card, names, guestNote, rejected, busy, onSend, onReceived }: CardContainerProps) {
  const { data: account } = usePayoutAccount(roomId, card.to);
  const requestAccount = useRequestPayoutAccount(roomId);
  const toName = names[card.to] ?? '';

  const copy = async () => {
    if (!account?.accountNumber || !account.bankName) return;
    await Clipboard.setStringAsync(
      copyText({ toName, amount: card.amount, bankName: account.bankName, accountNumber: account.accountNumber }),
    );
    if (!(await AsyncStorage.getItem(CLIPBOARD_NOTICE_KEY))) {
      await AsyncStorage.setItem(CLIPBOARD_NOTICE_KEY, '1');
      Alert.alert('복사했어요', '다른 기기와 클립보드가 동기화될 수 있어요');
    }
  };

  return (
    <TransferCard
      fromName={names[card.from] ?? ''}
      toName={toName}
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
          onSuccess: () => Alert.alert(`${toName}님께 계좌를 요청했어요`),
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
    <BottomSheet visible onClose={onClose}>
      <Text className="mb-1 font-semibold text-[17px] text-ink-900">{toName}님에게 보냈어요</Text>
      <Text className="mb-4 text-[13px] text-ink-500">정산 금액 {formatKrw(card.amount)}</Text>
      <TextInput
        accessibilityLabel="보낸 금액"
        keyboardType="number-pad"
        value={amount ? amount.toLocaleString('ko-KR') : ''}
        onChangeText={setText}
        style={{ fontVariant: ['tabular-nums'] }}
        className="mb-4 h-12 rounded-lg border border-input-line bg-white px-4 text-base text-ink-900 focus:border-sky-800 focus:bg-sky-100"
      />
      <PrimaryButton title="기록하기" disabled={busy || amount <= 0} onPress={() => onSubmit(id, amount)} />
    </BottomSheet>
  );
}
