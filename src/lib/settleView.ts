// 정산 화면 표시 모델. '정산 완료' 판정은 서버(my_rooms, room_balances(…, true))만 한다(ARCHITECTURE §6.5).
import type { Krw, MemberId } from '../types/domain';
import type { Transfer } from './matching';
import { formatKrw } from './money';

export type TransferRecord = {
  id: string;
  from: MemberId;
  to: MemberId;
  amount: Krw;
  confirmedAt: string | null;
  voidedAt: string | null;
  voidReason: 'cancelled' | 'not_received' | null;
  createdAt: string;
};

export type CardRole = 'payer' | 'payee' | 'observer'; // 나 기준: 줄 사람 / 받을 사람 / 제3자
export type SettleCard = { from: MemberId; to: MemberId; amount: Krw; role: CardRole };

// 내 카드 먼저, 그 안에서는 매칭 순서를 유지한다(Array.sort는 안정 정렬).
export function buildCards(transfers: Transfer[], me: MemberId): SettleCard[] {
  return transfers
    .map((t): SettleCard => ({ ...t, role: t.from === me ? 'payer' : t.to === me ? 'payee' : 'observer' }))
    .sort((a, b) => Number(a.role === 'observer') - Number(b.role === 'observer'));
}

export type RecordState = 'pending' | 'confirmed' | 'cancelled' | 'not_received';

export function recordState(r: TransferRecord): RecordState {
  if (r.voidedAt) return r.voidReason === 'not_received' ? 'not_received' : 'cancelled';
  return r.confirmedAt ? 'confirmed' : 'pending';
}

// "확인 대기 2건 · 민지, 지훈"
export function pendingConfirmSummary(records: TransferRecord[], names: Record<string, string>): string | null {
  const pending = records.filter((r) => recordState(r) === 'pending');
  if (pending.length === 0) return null;
  const who = [...new Set(pending.map((r) => names[r.to] ?? ''))].join(', ');
  return `확인 대기 ${pending.length}건 · ${who}`;
}

// 유효한 송금 기록 중 가장 이른 것보다 뒤에 지출이 바뀌었으면 true.
export function ledgerChangedAfterTransfer(records: TransferRecord[], lastExpenseUpdatedAt: string | null): boolean {
  if (!lastExpenseUpdatedAt) return false;
  const changed = Date.parse(lastExpenseUpdatedAt);
  return records.some((r) => !r.voidedAt && Date.parse(r.createdAt) < changed);
}

export function copyText(p: { toName: string; amount: Krw; bankName: string; accountNumber: string }): string {
  return `${p.toName}에게 ${formatKrw(p.amount)} · ${p.bankName} ${p.accountNumber}`;
}
