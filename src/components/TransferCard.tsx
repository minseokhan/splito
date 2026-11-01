import { ArrowRight, Bank, Check, Copy } from 'iconoir-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { formatKrw } from '@/components/Money';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { CardRole, RecordState } from '@/lib/settleView';
import type { PayoutAccount } from '@/services/api';
import { colors } from '@/theme/tokens';
import type { Krw } from '@/types/domain';

/** name: 실명(아바타·안내 문구), label: 카드 제목용("나" 또는 실명) */
export type Party = { name: string; label: string; colorIndex: number };

const BADGE = {
  send: { label: '보낼 차례', box: 'bg-sky-100', text: 'text-primary-text' },
  receive: { label: '받을 차례', box: 'bg-muted', text: 'text-ink-500' },
  todo: { label: '송금 전', box: 'bg-muted', text: 'text-ink-500' },
  pending: { label: '확인 대기', box: 'bg-warning-badge', text: 'text-warning' },
  confirmed: { label: '받았어요', box: 'bg-success-badge', text: 'text-success' },
  cancelled: { label: '취소됨', box: 'bg-muted', text: 'text-ink-500' },
  not_received: { label: '못 받음', box: 'bg-muted', text: 'text-ink-500' },
} as const;

type ShellProps = {
  from: Party;
  to: Party;
  amount: Krw;
  badge: keyof typeof BADGE;
  highlight?: boolean;
  voided?: boolean;
  sub?: string;
  children?: ReactNode;
};

// 아바타 + 그 아래 이름("나" 또는 실명).
function PartyAvatar({ party }: { party: Party }) {
  return (
    <View className="min-w-[38px] items-center gap-0.5">
      <Avatar name={party.name} colorIndex={party.colorIndex} size={38} />
      <Text className="text-[13px] text-ink-300" numberOfLines={1}>
        {party.label}
      </Text>
    </View>
  );
}

// 송금 카드 틀: 흰색 radius 22, padding 16/18/18, gap 12. 내가 보낼 차례면 테두리 2 primary.
// 맨 위 왼쪽 상태 배지 → 아바타 줄(이름은 아바타 아래) + 오른쪽 위 금액.
function Shell({ from, to, amount, badge, highlight, voided, sub, children }: ShellProps) {
  const b = BADGE[badge];
  return (
    <View
      className={`gap-3 rounded-[22px] border-2 bg-white px-[18px] pb-[18px] pt-4 ${highlight ? 'border-primary' : 'border-transparent'}`}
    >
      <View className={`self-start rounded-badge px-2 py-[3px] ${b.box}`}>
        <Text className={`font-semibold text-xs ${b.text}`}>{b.label}</Text>
      </View>
      <View className="flex-row items-center gap-2.5">
        <PartyAvatar party={from} />
        <View className="mb-5">
          <Icon as={ArrowRight} size={18} color={colors.ink[300]} />
        </View>
        <PartyAvatar party={to} />
        <View className="flex-1 items-end self-start">
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className={`font-semibold text-[28px] ${voided ? 'text-ink-300 line-through' : 'text-ink'}`}
          >
            {formatKrw(amount)}
          </Text>
        </View>
      </View>
      {sub && <Text className="text-[13px] text-ink-400">{sub}</Text>}
      {children}
    </View>
  );
}

type CardProps = {
  from: Party;
  to: Party;
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
  const payer = p.role === 'payer';
  const raw = payer ? a?.accountNumber : null;
  return (
    <Shell
      from={p.from}
      to={p.to}
      amount={p.amount}
      badge={payer ? 'send' : p.role === 'payee' ? 'receive' : 'todo'}
      highlight={payer}
      sub={p.guestNote}
    >
      {p.note && <Text className="text-[13px] text-danger">{p.note}</Text>}
      {payer && a && (
        <View className="flex-row items-center gap-2.5 rounded-input bg-app px-3.5 py-3">
          <Icon as={Bank} size={20} color={colors.primary.text} />
          {a.registered ? (
            <>
              <Text style={{ fontVariant: ['tabular-nums'] }} className="flex-1 text-[15px] text-ink">
                <Text className="font-semibold">{a.bankName}</Text> {raw ?? a.accountMasked}
                {'\n'}
                <Text className="text-ink-400">예금주 {a.holderName}</Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${p.to.name}님 송금 정보 복사`}
                disabled={!raw}
                onPress={p.onCopy}
                hitSlop={8}
                className={`flex-row items-center gap-1 px-2 py-1.5 ${raw ? '' : 'opacity-40'}`}
              >
                <Icon as={Copy} size={16} color={colors.primary.text} />
                <Text className="font-semibold text-sm text-primary-text">복사</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="flex-1 text-[15px] text-ink-500">아직 계좌를 등록하지 않았어요</Text>
              <Pressable accessibilityRole="button" onPress={p.onRequestAccount} hitSlop={8} className="px-2 py-1.5">
                <Text className="font-semibold text-sm text-primary-text">계좌 요청하기</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
      {payer && <PrimaryButton title="보냈어요" variant="dark" size="md" disabled={p.busy} onPress={p.onSend} />}
      {p.role === 'payee' && <PrimaryButton title="받았어요" variant="dark" size="md" disabled={p.busy} onPress={p.onReceived} />}
    </Shell>
  );
}

type RecordProps = {
  from: Party;
  to: Party;
  amount: Krw;
  state: RecordState;
  busy?: boolean;
  onConfirm?: () => void; // 받을 사람, 확인 대기일 때
  onReject?: () => void;
  onCancel?: () => void; // 보낸 사람, 확인 대기일 때
};

// 송금 기록 카드 + 상태 배지. 무효 기록은 취소선.
export function TransferRecordRow(p: RecordProps) {
  const voided = p.state === 'cancelled' || p.state === 'not_received';
  return (
    <Shell from={p.from} to={p.to} amount={p.amount} badge={p.state} voided={voided}>
      {p.onCancel && (
        <View className="flex-row gap-2">
          <View className="h-[52px] flex-1 flex-row items-center justify-center gap-1.5 rounded-input bg-sky-100">
            <Icon as={Check} size={18} color={colors.primary.text} />
            <Text className="font-semibold text-base text-primary-text" numberOfLines={1}>
              {p.to.name}님 확인을 기다려요
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={p.busy}
            onPress={p.onCancel}
            className="h-[52px] items-center justify-center rounded-input bg-muted px-4 active:bg-line"
          >
            <Text className="font-semibold text-base text-ink-500">취소</Text>
          </Pressable>
        </View>
      )}
      {(p.onConfirm || p.onReject) && (
        <View className="flex-row gap-2">
          {p.onReject && <PrimaryButton title="못 받았어요" variant="muted" size="md" grow disabled={p.busy} onPress={p.onReject} />}
          {p.onConfirm && <PrimaryButton title="받았어요" variant="dark" size="md" grow disabled={p.busy} onPress={p.onConfirm} />}
        </View>
      )}
    </Shell>
  );
}
