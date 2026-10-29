import { Pressable, Text, View } from 'react-native';

import { formatKrw } from '@/components/Money';
import type { RecordState, CardRole } from '@/lib/settleView';
import type { PayoutAccount } from '@/services/api';
import type { Krw } from '@/types/domain';

type CardProps = {
  fromName: string;
  toName: string;
  amount: Krw;
  role: CardRole;
  account?: PayoutAccount; // 로딩 중이면 undefined
  guestNote?: string; // "엄마 몫 포함"
  note?: string; // "받지 못했다고 표시했어요"
  busy?: boolean;
  onCopy: () => void;
  onSend: () => void;
  onReceived: () => void;
  onRequestAccount: () => void;
};

// 남은 송금안 카드. 계좌 원문은 내가 줄 사람일 때만 서버가 준다.
export function TransferCard(p: CardProps) {
  const a = p.account;
  const raw = p.role === 'payer' ? a?.accountNumber : null;
  return (
    <View className="gap-3 rounded-lg border border-line p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-semibold text-[15px] text-ink-900">
            {p.fromName} → {p.toName}
          </Text>
          {p.guestNote && <Text className="text-[13px] text-ink-500">{p.guestNote}</Text>}
        </View>
        <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-[20px] text-ink-900">
          {formatKrw(p.amount)}
        </Text>
      </View>
      {a && !a.registered ? (
        <View className="flex-row items-center">
          <Text className="text-[13px] text-ink-500">계좌 미등록 · </Text>
          <Pressable accessibilityRole="button" onPress={p.onRequestAccount} hitSlop={12}>
            <Text className="font-medium text-[13px] text-sky-900">계좌 요청하기</Text>
          </Pressable>
        </View>
      ) : (
        a && (
          <Text style={{ fontVariant: ['tabular-nums'] }} className="text-[13px] text-ink-500">
            {a.bankName} {raw ?? a.accountMasked} · {a.holderName}
          </Text>
        )
      )}
      {p.note && <Text className="text-[13px] text-minus">{p.note}</Text>}
      {p.role === 'payer' && (
        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${p.toName}님 송금 정보 복사`}
            disabled={!raw}
            onPress={p.onCopy}
            className={`h-14 flex-1 items-center justify-center rounded-xl bg-sky-200 ${raw ? '' : 'opacity-40'}`}
          >
            <Text className="font-semibold text-base text-ink-900">복사</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={p.busy}
            onPress={p.onSend}
            className="h-14 flex-1 items-center justify-center rounded-xl bg-sky-800 active:bg-[#1FA3F0]"
          >
            <Text className="font-bold text-base text-ink-900">보냈어요</Text>
          </Pressable>
        </View>
      )}
      {p.role === 'payee' && (
        <Pressable
          accessibilityRole="button"
          disabled={p.busy}
          onPress={p.onReceived}
          className="h-14 items-center justify-center rounded-xl bg-sky-800 active:bg-[#1FA3F0]"
        >
          <Text className="font-bold text-base text-ink-900">받았어요</Text>
        </Pressable>
      )}
    </View>
  );
}

const CHIP: Record<RecordState, { label: string; cls: string; fg: string }> = {
  pending: { label: '확인 대기', cls: 'bg-sky-200', fg: 'text-ink-900' },
  confirmed: { label: '확인됨', cls: 'bg-done-bg', fg: 'text-done-fg' },
  cancelled: { label: '취소됨', cls: 'bg-pending-bg', fg: 'text-ink-500' },
  not_received: { label: '못 받음', cls: 'bg-pending-bg', fg: 'text-ink-500' },
};

type RecordProps = {
  fromName: string;
  toName: string;
  amount: Krw;
  state: RecordState;
  busy?: boolean;
  onConfirm?: () => void; // 받을 사람, 확인 대기일 때
  onReject?: () => void;
  onCancel?: () => void; // 보낸 사람, 확인 대기일 때
};

// 송금 기록 한 줄 + 상태 칩. 무효 기록은 취소선.
export function TransferRecordRow(p: RecordProps) {
  const c = CHIP[p.state];
  const voided = p.state === 'cancelled' || p.state === 'not_received';
  return (
    <View className="gap-2 rounded-lg border border-line px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className={`flex-1 text-[15px] ${voided ? 'text-ink-500 line-through' : 'text-ink-900'}`}>
          {p.fromName} → {p.toName}
        </Text>
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className={`font-semibold text-[15px] ${voided ? 'text-ink-500 line-through' : 'text-ink-900'}`}
        >
          {formatKrw(p.amount)}
        </Text>
        <View className={`rounded-md px-2 py-1 ${c.cls}`}>
          <Text className={`font-semibold text-xs ${c.fg}`}>{c.label}</Text>
        </View>
      </View>
      {(p.onConfirm || p.onCancel) && (
        <View className="flex-row justify-end gap-4">
          {p.onReject && (
            <Pressable accessibilityRole="button" disabled={p.busy} onPress={p.onReject} className="h-11 justify-center">
              <Text className="font-medium text-[15px] text-sky-900">못 받았어요</Text>
            </Pressable>
          )}
          {p.onConfirm && (
            <Pressable
              accessibilityRole="button"
              disabled={p.busy}
              onPress={p.onConfirm}
              className="h-11 justify-center rounded-xl bg-sky-800 px-4 active:bg-[#1FA3F0]"
            >
              <Text className="font-bold text-[15px] text-ink-900">받았어요</Text>
            </Pressable>
          )}
          {p.onCancel && (
            <Pressable accessibilityRole="button" disabled={p.busy} onPress={p.onCancel} className="h-11 justify-center">
              <Text className="font-medium text-[15px] text-sky-900">취소</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
