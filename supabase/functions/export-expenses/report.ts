// 지출 내역 내보내기의 내용(순수 로직). Excel·PDF는 이 결과를 그리기만 한다.
// 사람별 몫은 DB export_expense_shares(= room_balances와 같은 배분)가 정답이다. 여기서 다시 나누지 않는다.

type ExpenseRow = {
  id: string;
  payer_kind: 'member' | 'pool';
  payer_member_id: string | null;
  source: string;
  flags: string[];
  merchant: string | null;
  paid_local_date: string; // YYYY-MM-DD
  paid_local_time: string | null; // HH:MM:SS
  currency: string;
  amount_original: number;
  krw_amount: number | null; // null = 환율 대기
  fx_rate: number | null; // 1단위당 원
  fx_source: string;
  visibility: 'shared' | 'private';
  category: string | null;
  schedule_id: string | null;
  created_by: string; // user id
  created_at: string;
  itemized: boolean; // 품목에 먹은 사람 지정이 있다
};

export type ReportInput = {
  now: Date;
  me: { userId: string; memberId: string };
  room: { name: string; base_currency: string; start_date: string | null; end_date: string | null; owner_id: string };
  members: { id: string; kind: 'user' | 'guest'; userId: string | null; name: string; leftAt: string | null; spotOnly: boolean }[];
  expenses: ExpenseRow[]; // 삭제 제외, 공동 + 내 나만 보기(RLS가 거른다)
  scope: { expense_id: string; member_id: string }[];
  shares: { expense_id: string; member_id: string; share: number }[];
  schedules: { id: string; day_index: number; start_time: string; title: string }[];
  spotDone: string[]; // 이 자리 정산을 보낸 지출 id
};

export type Row = {
  id: string;
  date: string; // 2026.10.20
  day: string; // 여행 전 / 1일차 / ''
  time: string;
  title: string;
  category: string;
  schedule: string;
  payer: string;
  uploader: string;
  visibility: '모두' | '나만';
  local: number;
  currency: string;
  rate: number | null; // 원화 결제·환율 대기면 null
  krw: number | null; // 환율 대기면 null
  split: '1/N' | '품목별' | '나만 보기';
  participants: string;
  shares: number[]; // columns 순서
  mine: number;
  spot: '완료' | '';
  input: string;
};

export type Report = ReturnType<typeof buildReport>;

const CATEGORY: Record<string, string> = {
  food: '식비', transport: '교통', lodging: '숙소', shopping: '쇼핑', sightseeing: '관광', other: '기타',
};
const SOURCE: Record<string, string> = {
  receipt: '영수증', card_text: '카드 문자', card_image: '카드 문자', voice: '말로', manual: '직접',
};
// 요약의 '1엔 = 9.10원' 단위 이름. 앱 src/lib/currency의 이름과 같다(Edge Function은 src를 못 읽는다).
const UNIT: Record<string, string> = {
  JPY: '엔', USD: '달러', EUR: '유로', CNY: '위안', HKD: '홍콩 달러', TWD: '대만 달러', THB: '바트', VND: '동',
  PHP: '페소', SGD: '싱가포르 달러', IDR: '루피아', AUD: '호주 달러', GBP: '파운드', CAD: '캐나다 달러', CHF: '프랑',
};

const dot = (d: string) => d.replaceAll('-', '.');
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function kst(now: Date): string {
  const k = new Date(now.getTime() + 9 * 3600_000).toISOString();
  return `${dot(k.slice(0, 10))} ${k.slice(11, 16)}`;
}

function period(start: string | null, end: string | null): string {
  if (!start) return '';
  if (!end) return dot(start);
  const tail = start.slice(0, 4) === end.slice(0, 4) ? dot(end.slice(5)) : dot(end);
  const nights = dayDiff(end, start);
  return `${dot(start)} – ${tail}${nights > 0 ? ` (${nights}박 ${nights + 1}일)` : ''}`;
}

export function buildReport(input: ReportInput) {
  const { room, me } = input;
  const byId = new Map(input.members.map((m) => [m.id, m]));
  const userName = new Map(input.members.flatMap((m) => (m.userId ? [[m.userId, m]] : [])));
  const label = (m: { name: string; leftAt: string | null } | undefined) => (m ? `${m.name}${m.leftAt ? ' (나감)' : ''}` : '');
  const myName = byId.get(me.memberId)?.name ?? '';
  const pre = (date: string) => !!room.start_date && date < room.start_date;
  const dayOf = (date: string) =>
    !room.start_date ? '' : pre(date) ? '여행 전' : `${dayDiff(date, room.start_date) + 1}일차`;

  // 몫 열: 동행(QR 참여자 제외) + 몫이나 결제가 있는 나머지(나간 사람·QR 참여자)
  const touched = new Set([
    ...input.shares.map((s) => s.member_id),
    ...input.expenses.flatMap((e) => (e.payer_member_id ? [e.payer_member_id] : [])),
  ]);
  const cols = input.members.filter((m) => (!m.leftAt && !m.spotOnly) || touched.has(m.id));
  const colIdx = new Map(cols.map((m, i) => [m.id, i]));
  const shareOf = new Map<string, number[]>();
  for (const s of input.shares) {
    const arr = shareOf.get(s.expense_id) ?? new Array(cols.length).fill(0);
    const i = colIdx.get(s.member_id);
    if (i !== undefined) arr[i] += s.share;
    shareOf.set(s.expense_id, arr);
  }
  const scopeNames = new Map<string, string[]>();
  for (const s of input.scope) scopeNames.set(s.expense_id, [...(scopeNames.get(s.expense_id) ?? []), label(byId.get(s.member_id))]);
  const schedule = new Map(input.schedules.map((s) => [s.id, s.title]));
  const spot = new Set(input.spotDone);
  const myCol = colIdx.get(me.memberId);

  const rows: Row[] = [...input.expenses]
    .sort(
      (a, b) =>
        a.paid_local_date.localeCompare(b.paid_local_date) ||
        // 시간 없는 지출은 그날 맨 뒤
        (a.paid_local_time ?? '99').localeCompare(b.paid_local_time ?? '99') ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((e) => {
      const shares = e.krw_amount === null ? new Array(cols.length).fill(0) : (shareOf.get(e.id) ?? new Array(cols.length).fill(0));
      const priv = e.visibility === 'private';
      return {
        id: e.id,
        date: dot(e.paid_local_date),
        day: dayOf(e.paid_local_date),
        time: e.paid_local_time?.slice(0, 5) ?? '',
        title: e.merchant ?? '',
        category: CATEGORY[e.category ?? ''] ?? '',
        schedule: e.schedule_id ? (schedule.get(e.schedule_id) ?? '') : '',
        payer: e.payer_kind === 'pool' ? '공금' : label(byId.get(e.payer_member_id ?? '')),
        uploader: label(userName.get(e.created_by)),
        visibility: priv ? '나만' : '모두',
        local: Number(e.amount_original),
        currency: e.currency,
        rate: e.currency === 'KRW' || e.fx_rate === null ? null : Number(e.fx_rate),
        krw: e.krw_amount,
        split: priv ? '나만 보기' : e.itemized ? '품목별' : '1/N',
        participants: (scopeNames.get(e.id) ?? []).join(', '),
        shares,
        mine: myCol === undefined ? 0 : shares[myCol],
        spot: spot.has(e.id) ? '완료' : '',
        input: e.flags.includes('auto_prepay') ? '자동 등록' : (SOURCE[e.source] ?? ''),
      };
    });

  const shared = rows.filter((r) => r.visibility === '모두' && r.krw !== null);
  const isPre = (r: Row) => r.day === '여행 전';

  // 사람별 정리(공동 지출만). 공금 결제는 사람이 아니라 '공금' 한 줄로 받는다 — 그래야 차액 합이 0이다.
  const paidBy = new Map<string, number>();
  for (const e of input.expenses) {
    if (e.visibility !== 'shared' || e.krw_amount === null) continue;
    const k = e.payer_kind === 'pool' ? 'pool' : e.payer_member_id!;
    paidBy.set(k, (paidBy.get(k) ?? 0) + e.krw_amount);
  }
  const people = cols.map((m, i) => {
    const paid = paidBy.get(m.id) ?? 0;
    const spent = sum(shared.map((r) => r.shares[i]));
    return {
      name: label(m),
      role: m.kind === 'guest' ? '게스트' : m.userId === room.owner_id ? '방장' : '참여자',
      paid,
      spent,
      diff: paid - spent,
    };
  });
  if (paidBy.has('pool')) people.push({ name: '공금', role: '', paid: paidBy.get('pool')!, spent: 0, diff: paidBy.get('pool')! });
  const diffSum = sum(people.map((p) => p.diff));
  if (diffSum !== 0) throw new Error(`EXPORT_INVARIANT diff sum ${diffSum}`);

  const days = [...new Set(rows.map((r) => r.date))].map((date) => {
    const inDay = rows.filter((r) => r.date === date);
    const sharedDay = inDay.filter((r) => r.visibility === '모두' && r.krw !== null);
    const day = inDay[0].day;
    const idx = day === '여행 전' ? 0 : Number.parseInt(day, 10);
    const first = input.schedules
      .filter((s) => s.day_index === idx && day !== '')
      .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
    return {
      day,
      date,
      schedule: first?.title ?? '',
      shared: sum(sharedDay.map((r) => r.krw!)),
      shares: cols.map((_, i) => sum(sharedDay.map((r) => r.shares[i]))),
      mine: sum(inDay.map((r) => r.mine)),
    };
  });

  const mineRows = rows
    .filter((r) => r.mine > 0)
    .map((r) => ({ id: r.id, date: r.date, title: r.visibility === '나만' ? `${r.title} (나만 보기)` : r.title, payer: r.payer, krw: r.krw!, mine: r.mine }));

  // 기본 통화 환율이 한 가지면 '1엔 = 9.10원'으로 적는다. 여러 날 환율이 섞이면 지출별로 본다.
  const rates = [...new Set(input.expenses.filter((e) => e.currency === room.base_currency && e.fx_rate !== null).map((e) => Number(e.fx_rate)))];
  const rateNote = room.base_currency !== 'KRW' && rates.length === 1
    ? `1${UNIT[room.base_currency] ?? room.base_currency} = ${rates[0].toFixed(2)}원`
    : null;

  const ymd = (d: string) => d.replaceAll('-', '');
  const fileSpan = room.start_date
    ? `_${ymd(room.start_date)}${room.end_date ? `-${room.end_date.slice(0, 4) === room.start_date.slice(0, 4) ? ymd(room.end_date).slice(4) : ymd(room.end_date)}` : ''}`
    : '';
  const safe = (s: string) => s.replace(/[\s·.,/\\:*?"<>|]+/g, '');

  return {
    meta: `내보낸 시각 ${kst(input.now)} · 내보낸 사람 ${myName}`,
    exporter: myName,
    trip: {
      name: room.name,
      period: period(room.start_date, room.end_date),
      baseCurrency: rateNote ? `${room.base_currency} (환율 ${rateNote})` : room.base_currency,
      rateNote,
      participants: input.members
        .filter((m) => !m.leftAt && !m.spotOnly)
        .map((m) => `${m.name}${m.userId === room.owner_id ? '(방장)' : m.kind === 'guest' ? '(게스트)' : ''}`)
        .join(', '),
      chips: input.members
        .filter((m) => !m.leftAt && !m.spotOnly)
        .map((m) => ({ name: m.name, tag: m.userId === room.owner_id ? '방장' : m.kind === 'guest' ? '게스트' : '' })),
    },
    columns: cols.map(label),
    rows,
    totals: {
      shared: sum(shared.map((r) => r.krw!)),
      pre: sum(shared.filter(isPre).map((r) => r.krw!)),
      during: sum(shared.filter((r) => !isPre(r)).map((r) => r.krw!)),
      mine: sum(rows.map((r) => r.mine)),
      minePre: sum(rows.filter(isPre).map((r) => r.mine)),
    },
    days,
    people,
    mine: mineRows,
    filename: (ext: 'xlsx' | 'pdf') => `Splito_${safe(room.name)}${fileSpan}_${safe(myName)}.${ext}`,
  };
}
