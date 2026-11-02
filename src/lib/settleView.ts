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

export type RecordState = 'pending' | 'confirmed' | 'cancelled' | 'not_received';

export function recordState(r: TransferRecord): RecordState {
  if (r.voidedAt) return r.voidReason === 'not_received' ? 'not_received' : 'cancelled';
  return r.confirmedAt ? 'confirmed' : 'pending';
}

// 카드 하나 = 내가(또는 내가 대표하는 게스트가) 주고받을 한 건.
// need: 아직 안 보냄 / waiting: 보냈고 상대 확인 대기 / confirm: 상대가 보냈다고 알려옴 / done: 확인됨
export type SettleState = 'need' | 'waiting' | 'confirm' | 'done';

export type SettleItem = {
  key: string;
  from: MemberId;
  to: MemberId;
  amount: Krw;
  dir: 'send' | 'recv'; // 나(또는 내 게스트) 기준
  state: SettleState;
  transferId: string | null; // 기록이 있는 카드만
  onBehalfOf: MemberId | null; // 내 게스트를 대신하는 카드면 그 참여자 id
  rejected: boolean; // 상대가 '못 받았어요'로 무효화한 적이 있다
};

const ORDER: Record<SettleState, number> = { confirm: 0, need: 1, waiting: 2, done: 3 };

// 송금안(그리디 매칭) + 송금 기록 → 내 카드 목록. 제3자끼리의 송금은 보여주지 않는다(시안).
export function buildSettleItems(
  plan: Transfer[],
  records: TransferRecord[],
  me: MemberId,
  guests: MemberId[],
): SettleItem[] {
  const mine = new Set([me, ...guests]);
  // 나와 내 게스트가 함께 당사자면 '나'를 기준으로 방향을 정한다.
  const dirOf = (from: MemberId, to: MemberId) => (to === me ? 'recv' : from === me ? 'send' : mine.has(from) ? 'send' : 'recv');
  const behalf = (from: MemberId, to: MemberId) =>
    from === me || to === me ? null : mine.has(from) ? from : mine.has(to) ? to : null;

  const items: SettleItem[] = [];
  const rejected = new Set<string>();
  for (const r of records) {
    if (!mine.has(r.from) && !mine.has(r.to)) continue;
    const state = recordState(r);
    if (state === 'cancelled') continue; // 취소된 기록은 송금안으로 되돌아간다
    if (state === 'not_received') {
      rejected.add(`${r.from}>${r.to}`);
      continue;
    }
    const dir = dirOf(r.from, r.to);
    items.push({
      key: r.id,
      from: r.from,
      to: r.to,
      amount: r.amount,
      dir,
      state: state === 'confirmed' ? 'done' : dir === 'send' ? 'waiting' : 'confirm',
      transferId: r.id,
      onBehalfOf: behalf(r.from, r.to),
      rejected: false,
    });
  }
  for (const t of plan) {
    if (!mine.has(t.from) && !mine.has(t.to)) continue;
    const key = `${t.from}>${t.to}`;
    items.push({
      key,
      from: t.from,
      to: t.to,
      amount: t.amount,
      dir: dirOf(t.from, t.to),
      state: 'need',
      transferId: null,
      onBehalfOf: behalf(t.from, t.to),
      rejected: rejected.has(key),
    });
  }
  // 눌러야 하는 것부터. Array.sort는 안정 정렬이라 같은 상태끼리는 입력 순서가 유지된다.
  return items.sort((a, b) => ORDER[a.state] - ORDER[b.state]);
}

// 요약: "보낼 돈 2건, 받을 돈 1건" / "총 244,920원을 보내주세요". 끝난 건은 세지 않는다.
export function settleHeadline(items: SettleItem[]) {
  const open = items.filter((i) => i.state !== 'done');
  const send = open.filter((i) => i.dir === 'send');
  const recv = open.filter((i) => i.dir === 'recv');
  const sum = (xs: SettleItem[]) => xs.reduce((s, i) => s + i.amount, 0);
  const toSend = send.filter((i) => i.state === 'need');
  const sub = toSend.length
    ? `총 ${formatKrw(sum(toSend))}을 보내주세요`
    : recv.length
      ? `총 ${formatKrw(sum(recv))}을 받을 차례예요`
      : send.length
        ? '상대 확인을 기다리고 있어요'
        : '모든 송금이 정리됐어요';
  return {
    title: open.length ? `보낼 돈 ${send.length}건, 받을 돈 ${recv.length}건` : '정산할 돈이 없어요',
    sub,
    send: send.length,
    recv: recv.length,
  };
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

// 게스트는 앱이 없다. 대표자가 이 글을 카카오톡 등으로 보내 금액을 알려준다.
export function guestNoticeText(p: {
  roomName: string;
  guestName: string;
  otherName: string;
  dir: 'send' | 'recv';
  amount: Krw;
  account: { bankName: string; accountNumber: string; holderName: string } | null;
}): string {
  const head = `[${p.roomName}] 정산 안내`;
  if (p.dir === 'recv') return `${head}\n${p.otherName}님이 ${p.guestName}님에게 ${formatKrw(p.amount)}을 보낼 거예요.`;
  const line = `${head}\n${p.guestName}님이 ${p.otherName}님에게 ${formatKrw(p.amount)}을 보내주세요.`;
  return p.account ? `${line}\n${p.account.bankName} ${p.account.accountNumber} (예금주 ${p.account.holderName})` : line;
}
