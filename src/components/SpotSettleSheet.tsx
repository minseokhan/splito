import { Check, Circle, CheckCircleSolid, InfoCircle, QrCode, Square, CheckSquareSolid } from 'iconoir-react-native';
import { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { formatForeign, formatKrw } from '@/lib/money';
import { buildSpotUrl, nextExpenseSelection, spotTotals } from '@/lib/spotSettle';
import type { SpotSettle } from '@/services/api';
import { colors } from '@/theme/tokens';
import type { MemberId, RoomMember } from '@/types/domain';

import { Avatar } from './Avatar';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { PrimaryButton } from './PrimaryButton';
import { useToast } from './Toast';

const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? 'splito-trip.vercel.app';

type Props = {
  spot: SpotSettle | null;
  members: RoomMember[];
  myMemberId: MemberId | undefined;
  busy?: boolean;
  onClose: () => void;
  onSend: (input: { expenseIds: string[]; memberIds: MemberId[] }) => void;
  onConfirm: (input: { memberId: MemberId; confirmed: boolean }) => void;
};

type Row = {
  member: RoomMember;
  colorIndex: number;
  isQr: boolean;
  isPayer: boolean;
  isMe: boolean;
  tag: string;
  confirmed: boolean;
};

// 호출부는 <SpotSettleSheet key={spot.id} .../>로 쓴다 — 정산이 바뀌면 고른 것도 새로 시작한다.
export function SpotSettleSheet({ spot, members, myMemberId, busy, onClose, onSend, onConfirm }: Props) {
  const toast = useToast();
  const sent = !!spot?.sentAt;
  // 서버 상태를 복사해 두지 않고 '내가 손댄 차이'만 들고 있는다. 그래야 QR로 새로 들어온 사람이
  // 폴링으로 도착할 때 효과로 다시 맞출 필요 없이 그냥 보인다.
  const [pickedOverride, setPickedOverride] = useState<string[] | null>(null);
  const [added, setAdded] = useState<MemberId[]>([]);
  const [removed, setRemoved] = useState<MemberId[]>([]);

  const picked = pickedOverride ?? (spot?.expenses ?? []).filter((e) => e.selected).map((e) => e.id);
  const chosen = useMemo(() => {
    const base = (spot?.participants ?? []).map((p) => p.memberId);
    return [...new Set([...base, ...added])].filter((id) => !removed.includes(id));
  }, [spot, added, removed]);

  const payerMemberId = useMemo(() => {
    const first = spot?.expenses.find((e) => picked.includes(e.id));
    return first?.payerMemberId ?? spot?.payerMemberId ?? '';
  }, [spot, picked]);

  const rows = useMemo<Row[]>(() => {
    if (!spot) return [];
    const byId = new Map(spot.participants.map((p) => [p.memberId, p]));
    // 아바타 색은 합류 순서로 고정한다 — 멤버 화면·여행 상세와 같은 규칙.
    const colorIndex = new Map(members.map((m, i) => [m.id, i]));
    // 다른 자리의 QR 참여자는 이 시트에 뜨면 안 된다 — 이 정산의 참여자일 때만 보여준다.
    const here = (m: RoomMember) => !m.spotOnly || byId.has(m.id);
    const shown = sent
      ? members.filter((m) => chosen.includes(m.id))
      : members.filter((m) => !m.leftAt && here(m));
    return shown.map((m) => {
      const p = byId.get(m.id);
      const isQr = !!p?.isQr;
      const isPayer = m.id === payerMemberId;
      const isMe = m.id === myMemberId;
      const base = isMe ? '나' : isQr ? 'QR 참여' : m.kind === 'guest' ? '게스트' : '동행';
      return { member: m, colorIndex: colorIndex.get(m.id) ?? 0, isQr, isPayer, isMe, confirmed: !!p?.confirmed, tag: isPayer ? `${base} · 결제` : base };
    });
  }, [spot, members, chosen, sent, payerMemberId, myMemberId]);

  const selectedExpenses = useMemo(() => (spot?.expenses ?? []).filter((e) => picked.includes(e.id)), [spot, picked]);
  const totals = spotTotals(selectedExpenses, chosen.length);
  if (!spot) return null;

  const payerName = members.find((m) => m.id === payerMemberId)?.name ?? '결제자';
  const payerIsMe = payerMemberId === myMemberId;

  const toggleExpense = (id: string) => {
    const next = nextExpenseSelection(spot.expenses, picked, id);
    if ('error' in next) return toast('지출을 하나 이상 골라 주세요');
    setPickedOverride(next.selected);
    // 결제자가 바뀌면 그 사람을 참여자에 더한다(한 번의 정산은 결제자가 한 명).
    setAdded((prev) => (prev.includes(next.payerMemberId) ? prev : [...prev, next.payerMemberId]));
    setRemoved((prev) => prev.filter((id) => id !== next.payerMemberId));
  };

  const toggleMember = (id: MemberId) => {
    if (sent || id === myMemberId || id === payerMemberId) return;
    if (chosen.includes(id)) {
      setAdded((prev) => prev.filter((x) => x !== id));
      setRemoved((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setRemoved((prev) => prev.filter((x) => x !== id));
      setAdded((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  };

  const send = () => {
    if (chosen.length < 2) return toast('함께한 사람을 골라 주세요');
    if (!spot.payerHasAccount && rows.some((r) => r.isQr && !r.isPayer)) {
      return toast(payerIsMe ? '받을 계좌를 먼저 등록해 주세요' : `${payerName}님이 받을 계좌를 등록해야 해요`);
    }
    onSend({ expenseIds: picked, memberIds: chosen });
  };

  return (
    <BottomSheet visible onClose={onClose} title="이 자리 정산" subtitle={`${spot.scheduleTime} · ${spot.scheduleTitle}`}>
      <ScrollView
        style={{ maxHeight: Dimensions.get('window').height * 0.58 }}
        contentContainerClassName="gap-3.5 pb-1"
        showsVerticalScrollIndicator={false}
      >
        {/* 지출 고르기 — 일정에 지출이 2건 이상일 때만(명세 §2-2) */}
        {!sent && spot.expenses.length > 1 && (
          <View className="gap-2">
            <Text className="font-semibold text-sm text-ink-500">어떤 지출을 나눌까요?</Text>
            {spot.expenses.map((e) => {
              const on = picked.includes(e.id);
              const other = !on && e.payerMemberId !== payerMemberId;
              const who = members.find((m) => m.id === e.payerMemberId)?.name ?? '참여자';
              return (
                <Pressable
                  key={e.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${e.merchant} ${formatKrw(e.krwAmount)}`}
                  onPress={() => toggleExpense(e.id)}
                  style={{ opacity: other ? 0.5 : 1 }}
                  className={`flex-row items-center gap-2.5 rounded-button border-[1.5px] px-3 py-2.5 ${on ? 'border-primary bg-sky-50' : 'border-card-line bg-white'}`}
                >
                  <Icon as={on ? CheckSquareSolid : Square} size={20} color={on ? colors.primary.DEFAULT : colors.line.off} />
                  <View className="min-w-0 flex-1">
                    <Text className="font-semibold text-[15px] text-ink" numberOfLines={1}>
                      {e.merchant}
                    </Text>
                    <Text className="text-xs text-ink-400">{who} 결제</Text>
                    {other && <Text className="text-xs text-warning">결제한 사람이 달라 따로 정산해요</Text>}
                  </View>
                  <View className="shrink-0 items-end">
                    {e.currency !== 'KRW' && (
                      <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-[15px] text-local">
                        {formatForeign(e.amountOriginal, e.currency)}
                      </Text>
                    )}
                    <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs text-ink-300">
                      {formatKrw(e.krwAmount)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* 요약 */}
        <View className="gap-1 rounded-button bg-app px-4 py-3.5">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="min-w-0 flex-1 text-[13px] text-ink-400" numberOfLines={1}>
              {selectedExpenses.map((e) => e.merchant).join(' · ') || '지출'}
            </Text>
            <View className="shrink-0 rounded-full bg-white px-2.5 py-1">
              <Text className="font-semibold text-xs text-ink-500">{payerName} 결제</Text>
            </View>
          </View>
          <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-2xl text-ink">
            {formatKrw(totals.sum)}
          </Text>
        </View>

        {/* QR — 보내기 전에만. 처음 만난 사람이 스캔해서 이 정산에만 들어온다 */}
        {!sent && (
          <View className="flex-row items-center gap-3.5 rounded-button border border-card-line bg-white p-3.5">
            <View className="rounded-[10px] bg-white p-1" accessibilityLabel="이 자리 정산 QR 코드">
              <QRCode value={buildSpotUrl(LINK_DOMAIN, spot.token)} size={76} color={colors.ink.DEFAULT} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-semibold text-base text-ink">이 QR을 보여주세요</Text>
              <Text className="text-[13px] text-ink-400">처음 만난 사람도 스캔하면 이 자리 정산에만 들어와요</Text>
            </View>
          </View>
        )}

        {/* 함께한 사람 */}
        <View className="gap-0.5">
          <View className="flex-row items-end justify-between pb-1">
            <Text className="font-semibold text-base text-ink">함께한 사람 {chosen.length}명</Text>
            <Text className="text-[13px] text-ink-500">
              1인 <Text className="font-semibold text-ink">{formatKrw(totals.share)}</Text>
            </Text>
          </View>
          {rows.map((r, i) => (
            <MemberRow
              key={r.member.id}
              row={r}
              first={i === 0}
              sent={sent}
              on={chosen.includes(r.member.id)}
              share={r.isPayer ? totals.payerShare : totals.share}
              payerIsMe={payerIsMe}
              onToggle={() => toggleMember(r.member.id)}
              onConfirm={(confirmed) => onConfirm({ memberId: r.member.id, confirmed })}
            />
          ))}
        </View>

        {/* 안내 */}
        <View className="flex-row gap-2 rounded-chip bg-sky-50 px-3 py-2.5">
          <Icon as={InfoCircle} size={15} color={colors.ink[400]} />
          <Text className="min-w-0 flex-1 text-xs text-ink-500">
            동행 몫은 여행 정산에 합쳐지고, QR로 들어온 사람은 {payerIsMe ? '나' : payerName}에게 바로 송금해요.
          </Text>
        </View>
      </ScrollView>

      <PrimaryButton
        title={sent ? '닫기' : '정산 요청 보내기'}
        variant="dark"
        disabled={busy}
        onPress={sent ? onClose : send}
      />
    </BottomSheet>
  );
}

function MemberRow({
  row,
  first,
  sent,
  on,
  share,
  payerIsMe,
  onToggle,
  onConfirm,
}: {
  row: Row;
  first: boolean;
  sent: boolean;
  on: boolean;
  share: number;
  payerIsMe: boolean;
  onToggle: () => void;
  onConfirm: (confirmed: boolean) => void;
}) {
  const locked = row.isMe || row.isPayer;
  return (
    <Pressable
      accessibilityRole={sent ? undefined : 'checkbox'}
      accessibilityState={sent ? undefined : { checked: on, disabled: locked }}
      accessibilityLabel={`${row.member.name} ${row.tag}`}
      onPress={onToggle}
      disabled={sent || locked}
      style={{ opacity: on || sent ? 1 : 0.55 }}
      className={`flex-row items-center gap-2.5 py-2 ${first ? '' : 'border-t border-muted'}`}
    >
      {!sent && (
        <Icon
          as={on ? CheckCircleSolid : Circle}
          size={22}
          color={on ? (locked ? colors.ink[300] : colors.primary.DEFAULT) : colors.line.off}
        />
      )}
      {/* QR 참여자는 흰 바탕 + 민트 테두리로 구분한다(시안) */}
      <Avatar
        name={row.member.name}
        colorIndex={row.colorIndex}
        guest={row.member.kind === 'guest' && !row.isQr}
        ring={row.isQr ? colors.success.DEFAULT : undefined}
      />
      <Text className="font-semibold text-[15px] text-ink" numberOfLines={1}>
        {row.member.name}
      </Text>
      <View className={`shrink-0 rounded-badge px-1.5 py-px ${row.isQr ? 'bg-success-bg' : 'bg-muted'}`}>
        <Text className={`font-semibold text-[11px] ${row.isQr ? 'text-success' : 'text-ink-500'}`}>{row.tag}</Text>
      </View>
      <View className="flex-1" />
      {sent ? (
        <StatusBadge row={row} share={share} payerIsMe={payerIsMe} onConfirm={onConfirm} />
      ) : (
        on && (
          <Text style={{ fontVariant: ['tabular-nums'] }} className="shrink-0 font-semibold text-[15px] text-ink">
            {formatKrw(share)}
          </Text>
        )
      )}
    </Pressable>
  );
}

// 보낸 뒤 오른쪽 배지. QR 참여자만 상태가 움직이고, 확인은 받는 사람(결제자)만 누를 수 있다.
function StatusBadge({
  row,
  share,
  payerIsMe,
  onConfirm,
}: {
  row: Row;
  share: number;
  payerIsMe: boolean;
  onConfirm: (confirmed: boolean) => void;
}) {
  if (row.isPayer) return <Pill label="받는 사람" />;
  if (!row.isQr) return <Pill label="여행 정산에 포함" />;
  if (!payerIsMe) return <Pill label="송금 대기" tone="warning" />;
  if (row.confirmed) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${row.member.name} 송금 확인 취소`} onPress={() => onConfirm(false)}>
        <Pill label="송금 완료" tone="success" />
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.member.name} ${formatKrw(share)} 받았어요`}
      onPress={() => onConfirm(true)}
      className="h-8 shrink-0 justify-center rounded-badge bg-ink px-2.5 active:opacity-80"
    >
      <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-xs text-white">
        {formatKrw(share)} · 받았어요
      </Text>
    </Pressable>
  );
}

function Pill({ label, tone }: { label: string; tone?: 'warning' | 'success' }) {
  const box = tone === 'warning' ? 'bg-warning-badge' : tone === 'success' ? 'bg-success-bg' : 'bg-muted';
  const text = tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-ink-500';
  return (
    <View className={`h-8 shrink-0 justify-center rounded-badge px-2.5 ${box}`}>
      <Text className={`font-semibold text-xs ${text}`}>{label}</Text>
    </View>
  );
}

// 일정 카드 아래 상태 줄. 민트 = QR 송금까지 다 끝남, 노랑 = 아직.
export function SpotStatusRow({ text, done, onPress }: { text: string; done: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded-[10px] px-2.5 py-[7px] ${done ? 'bg-success-bg' : 'bg-warning-spot'}`}
    >
      <Icon as={Check} size={15} color={done ? colors.success.DEFAULT : colors.warning['spot-text']} />
      <Text className={`min-w-0 flex-1 font-semibold text-xs ${done ? 'text-success' : 'text-warning-spot-text'}`}>{text}</Text>
      <Icon as={QrCode} size={14} color={done ? colors.success.DEFAULT : colors.warning['spot-text']} />
    </Pressable>
  );
}
