import { ArrowRight, Bank, Copy, Send } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { formatKrw } from '@/components/Money';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { SettleItem } from '@/lib/settleView';
import type { PayoutAccount } from '@/services/api';
import { colors } from '@/theme/tokens';

/** name: 실명(아바타·안내 문구), label: 카드 제목용("나" 또는 실명) */
export type Party = { name: string; label: string; colorIndex: number; guest?: boolean };

// 상태 배지(핸드오프 settlement.html): 송금 필요 / 받을 차례 / 확인 대기 / 입금 확인 필요 / 받았어요
const BADGE = {
  'send-need': { label: '송금 필요', box: 'bg-sky-100', text: 'text-primary-text' },
  'recv-need': { label: '받을 차례', box: 'bg-muted', text: 'text-ink-500' },
  'send-waiting': { label: '확인 대기', box: 'bg-warning-badge', text: 'text-warning' },
  'recv-confirm': { label: '입금 확인 필요', box: 'bg-warning-badge', text: 'text-warning' },
  'send-done': { label: '보냈어요', box: 'bg-success-badge', text: 'text-success' },
  'recv-done': { label: '받았어요', box: 'bg-success-badge', text: 'text-success' },
} as const;

const CARD_SHADOW = { boxShadow: '0 4px 16px -4px rgba(19,25,39,.10)' };

type Props = {
  item: SettleItem;
  from: Party;
  to: Party;
  account?: PayoutAccount; // 보낼 돈 카드에서만 쓴다(로딩 중이면 undefined)
  busy?: boolean;
  shareLabel?: string; // "엄마에게 알리기" — 게스트를 대신하는 카드에만
  onShare?: () => void;
  onCopy: () => void;
  onRequestAccount: () => void;
  onPrimary: () => void; // 보냈어요 / 받았어요
  onReject: () => void; // 못 받았어요
  onCancel: () => void; // 보낸 기록 취소
};

// 아바타 + 그 아래 이름("나" 또는 실명).
function PartyAvatar({ party }: { party: Party }) {
  return (
    <View className="min-w-[38px] items-center gap-0.5">
      <Avatar name={party.name} colorIndex={party.colorIndex} guest={party.guest} size={38} />
      <Text className="text-xs text-ink-300" numberOfLines={1}>
        {party.label}
      </Text>
    </View>
  );
}

// 정산 카드 한 장. 보낼 돈이면 계좌와 '보냈어요', 받을 돈이면 안내와 '받았어요'.
export function TransferCard({ item, from, to, account: a, busy, shareLabel, onShare, onCopy, onRequestAccount, onPrimary, onReject, onCancel }: Props) {
  const badge = BADGE[`${item.dir}-${item.state}` as keyof typeof BADGE] ?? BADGE['send-need'];
  const send = item.dir === 'send';
  const raw = send ? a?.accountNumber : null;

  return (
    <View className="gap-3 rounded-[22px] border border-card-line bg-white px-[18px] pb-[18px] pt-4" style={CARD_SHADOW}>
      <View className={`self-start rounded-badge px-2 py-[3px] ${badge.box}`}>
        <Text className={`font-semibold text-xs ${badge.text}`}>{badge.label}</Text>
      </View>

      <View className="flex-row items-center gap-2.5">
        <PartyAvatar party={from} />
        <View className="mb-5">
          <Icon as={ArrowRight} size={18} color={colors.ink[300]} />
        </View>
        <PartyAvatar party={to} />
        <View className="flex-1 items-end self-start">
          <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-2xl text-ink">
            {formatKrw(item.amount)}
          </Text>
        </View>
      </View>

      {item.rejected && <Text className="text-[13px] text-danger">받지 못했다고 표시했어요</Text>}

      {send && item.state !== 'done' && a && (
        <View className="flex-row items-center gap-2.5 rounded-input bg-app px-3.5 py-3">
          <Icon as={Bank} size={20} color={colors.primary.text} />
          {a.registered ? (
            <>
              <Text style={{ fontVariant: ['tabular-nums'] }} className="flex-1 text-sm text-ink">
                <Text className="font-semibold">{a.bankName}</Text> {raw ?? a.accountMasked}
                {'\n'}
                <Text className="text-ink-400">예금주 {a.holderName}</Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${to.name}님 송금 정보 복사`}
                disabled={!raw}
                onPress={onCopy}
                hitSlop={8}
                className={`flex-row items-center gap-1 px-2 py-1.5 ${raw ? '' : 'opacity-40'}`}
              >
                <Icon as={Copy} size={16} color={colors.primary.text} />
                <Text className="font-semibold text-[13px] text-primary-text">복사</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="flex-1 text-sm text-ink-500">아직 계좌를 등록하지 않았어요</Text>
              <Pressable accessibilityRole="button" onPress={onRequestAccount} hitSlop={8} className="px-2 py-1.5">
                <Text className="font-semibold text-[13px] text-primary-text">계좌 요청하기</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {item.state === 'confirm' && (
        <Text className="rounded-chip bg-app px-3 py-2.5 text-[13px] text-ink-500">
          {from.name}님이 보냈다고 알려왔어요. 입금을 확인하고 눌러주세요.
        </Text>
      )}

      {shareLabel && onShare && (
        <PrimaryButton title={shareLabel} icon={Send} variant="muted" size="md" disabled={busy} onPress={onShare} />
      )}

      {item.state === 'need' && (
        <PrimaryButton title={send ? '보냈어요' : '받았어요'} variant="dark" size="md" disabled={busy} onPress={onPrimary} />
      )}
      {item.state === 'confirm' && (
        <View className="flex-row gap-2">
          <PrimaryButton title="못 받았어요" variant="muted" size="md" grow disabled={busy} onPress={onReject} />
          <PrimaryButton title="받았어요" variant="dark" size="md" grow disabled={busy} onPress={onPrimary} />
        </View>
      )}
      {item.state === 'waiting' && (
        <View className="flex-row gap-2">
          <View className="h-[52px] flex-1 items-center justify-center rounded-input bg-muted px-3">
            <Text className="font-semibold text-base text-ink-700" numberOfLines={1}>
              {to.name}님 확인을 기다려요
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="송금 기록 취소"
            disabled={busy}
            onPress={onCancel}
            className="h-[52px] items-center justify-center rounded-input bg-muted px-4 active:bg-line"
          >
            <Text className="font-semibold text-base text-ink-500">취소</Text>
          </Pressable>
        </View>
      )}
      {item.state === 'done' && (
        <View className="h-[52px] items-center justify-center rounded-input bg-muted">
          <Text className="font-semibold text-base text-ink-700">정산 완료</Text>
        </View>
      )}
    </View>
  );
}
