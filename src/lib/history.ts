import { formatForeign } from './money';

// _expense_snapshot(save_expense 마이그레이션)이 만드는 jsonb 중 diff에 쓰는 키만. DB 키 그대로 둔다.
export type Snapshot = {
  merchant: string | null;
  paid_local_date: string;
  currency: string;
  amount_original: number;
  payer_kind: 'member' | 'pool';
  payer_member_id: string | null;
  deleted_at: string | null;
  scope_member_ids: string[];
  items: {
    id: string;
    position: number;
    name_original: string;
    name_ko: string | null;
    amount_original: number;
    assignee_member_ids: string[];
  }[];
};

type Item = Snapshot['items'][number];

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
};

// 연속한 두 snapshot을 비교해 사람이 읽는 변경 목록을 만든다.
export function diffSnapshots(prev: Snapshot | null, next: Snapshot, names: Record<string, string>): string[] {
  if (!prev) return ['처음 기록'];
  if (!prev.deleted_at && next.deleted_at) return ['삭제'];
  if (prev.deleted_at && !next.deleted_at) return ['복구'];

  const name = (id: string) => names[id] ?? '(알 수 없음)';
  const payer = (s: Snapshot) => (s.payer_kind === 'pool' ? '공금' : name(s.payer_member_id ?? ''));
  const people = (ids: string[]) => (ids.length ? [...ids].sort().map(name).join(', ') : '전원');
  const itemName = (i: Item) => i.name_ko ?? i.name_original;
  const out: string[] = [];

  if (prev.currency !== next.currency) out.push(`통화 ${prev.currency} → ${next.currency}`);
  if (prev.currency !== next.currency || prev.amount_original !== next.amount_original)
    out.push(`금액 ${formatForeign(prev.amount_original, prev.currency)} → ${formatForeign(next.amount_original, next.currency)}`);
  if (prev.paid_local_date !== next.paid_local_date)
    out.push(`결제일 ${shortDate(prev.paid_local_date)} → ${shortDate(next.paid_local_date)}`);
  if (prev.merchant !== next.merchant) out.push(`가맹점 ${prev.merchant ?? '(없음)'} → ${next.merchant ?? '(없음)'}`);
  if (payer(prev) !== payer(next)) out.push(`결제자 ${payer(prev)} → ${payer(next)}`);

  for (const id of next.scope_member_ids)
    if (!prev.scope_member_ids.includes(id)) out.push(`대상 인원에 ${name(id)} 추가`);
  for (const id of prev.scope_member_ids)
    if (!next.scope_member_ids.includes(id)) out.push(`대상 인원에서 ${name(id)} 제외`);

  const prevById = new Map(prev.items.map((i) => [i.id, i]));
  const nextIds = new Set(next.items.map((i) => i.id));
  for (const n of next.items) {
    const p = prevById.get(n.id);
    if (!p) {
      out.push(`박스 추가: ${itemName(n)} ${formatForeign(n.amount_original, next.currency)}`);
      continue;
    }
    if (p.amount_original !== n.amount_original && prev.currency === next.currency)
      out.push(`${itemName(n)} ${formatForeign(p.amount_original, prev.currency)} → ${formatForeign(n.amount_original, next.currency)}`);
    if (people(p.assignee_member_ids) !== people(n.assignee_member_ids))
      out.push(`${itemName(n)} 지정 ${people(p.assignee_member_ids)} → ${people(n.assignee_member_ids)}`);
  }
  for (const p of prev.items) if (!nextIds.has(p.id)) out.push(`박스 삭제: ${itemName(p)}`);

  return out;
}

// 이력 줄의 "10/22 21:14"(기기 현지 시각).
export function historyStamp(iso: string): string {
  const t = new Date(iso);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${t.getMonth() + 1}/${t.getDate()} ${hh}:${mm}`;
}
