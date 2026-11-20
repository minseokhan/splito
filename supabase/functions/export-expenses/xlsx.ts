// 지출 내역 Excel(시트 5개). 내용은 report.ts가 정하고 여기서는 칸·서식만 그린다.
// 모든 시트: 1행 제목, 2행 내보낸 시각·사람, 4행부터 표(남색 머리글, 줄무늬, 합계 행 강조).
import ExcelJS from 'npm:exceljs@4.4.0';
import type { Report } from './report.ts';

type Cell = string | number | null;
type Fmt = { num?: string[] | string; diff?: number }; // num: 열별 숫자 서식, diff: +/− 색을 칠할 열

const NAVY = 'FF0E1B3D';
const ACCENT = 'FF1D3C8F';
const STRIPE = 'FFF5F7FA';
const TOTAL = 'FFE8EEF9';
const LINE = 'FFE5E7EB';
const GRAY = 'FF6B7280';
const PLUS = 'FF0B7D6C';
const MINUS = 'FFD92D20';
const WON = '#,##0';
const FONT = 'Pretendard';
// 소수 자리가 없는 통화. 나머지는 2자리
const NO_DECIMAL = new Set(['KRW', 'JPY', 'VND', 'IDR']);

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function header(ws: ExcelJS.Worksheet, r: Report, title: string, width: number) {
  ws.mergeCells(1, 1, 1, width);
  const t = ws.getCell(1, 1);
  t.value = `${r.trip.name} · ${title}`;
  t.font = { name: FONT, size: 16, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, width);
  const m = ws.getCell(2, 1);
  m.value = r.meta;
  m.font = { name: FONT, size: 10, color: { argb: GRAY } };
}

// 머리글 + 본문(+ 합계) 표. 끝난 다음 행 번호를 돌려준다.
function table(ws: ExcelJS.Worksheet, top: number, heads: string[], body: Cell[][], fmt: Fmt = {}, total?: Cell[]): number {
  const numFmt = (i: number) => (Array.isArray(fmt.num) ? fmt.num[i] : fmt.num);
  const h = ws.getRow(top);
  heads.forEach((v, i) => {
    const c = h.getCell(i + 1);
    c.value = v;
    c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = fill(ACCENT);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  h.height = 24;
  const rows = total ? [...body, total] : body;
  rows.forEach((vals, ri) => {
    const row = ws.getRow(top + 1 + ri);
    const isTotal = !!total && ri === rows.length - 1;
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.font = { name: FONT, bold: isTotal };
      if (typeof v === 'number' && numFmt(i)) c.numFmt = numFmt(i)!;
      if (typeof v === 'number') c.alignment = { horizontal: 'right' };
      if (fmt.diff === i && typeof v === 'number' && v !== 0) c.font = { ...c.font, color: { argb: v > 0 ? PLUS : MINUS } };
      c.border = { bottom: { style: 'thin', color: { argb: LINE } } };
      if (isTotal) c.fill = fill(TOTAL);
      else if (ri % 2 === 1) c.fill = fill(STRIPE);
    });
    for (let i = vals.length; i < heads.length; i++) {
      const c = row.getCell(i + 1);
      if (isTotal) c.fill = fill(TOTAL);
      else if (ri % 2 === 1) c.fill = fill(STRIPE);
    }
  });
  ws.views = [{ state: 'frozen', ySplit: top }];
  return top + rows.length + 1;
}

function widths(ws: ExcelJS.Worksheet, ws_: number[]) {
  ws_.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

export async function renderXlsx(r: Report): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Splito';
  const n = r.columns.length;

  // 1. 요약 — 항목/값 2열
  {
    const ws = wb.addWorksheet('요약');
    header(ws, r, '요약', 2);
    const end = table(ws, 4, ['항목', '값'], [
      ['여행 이름', r.trip.name],
      ['기간', r.trip.period],
      ['기본 통화', r.trip.baseCurrency],
      ['참여자', r.trip.participants],
      ['총 지출 (공동)', r.totals.shared],
      ['└ 여행 전 지출', r.totals.pre],
      ['└ 여행 중 지출', r.totals.during],
      ['내가 쓴 금액', r.totals.mine],
    ], { num: ['', WON] });
    const mine = ws.getRow(end - 1);
    mine.eachCell((c) => {
      c.fill = fill(TOTAL);
      c.font = { name: FONT, bold: true, size: 12, color: { argb: ACCENT } };
    });
    for (let i = 5; i < end; i++) ws.getCell(i, 1).font = { ...ws.getCell(i, 1).font, bold: true };
    const note = ws.getCell(end + 1, 1);
    note.value = '내가 쓴 금액 = 공동 지출 중 내 몫 + 나만 보기 지출이에요. 원화 기준이에요.';
    note.font = { name: FONT, size: 10, color: { argb: GRAY } };
    widths(ws, [20, 48]);
  }

  // 2. 전체 지출 — 한 줄 = 지출 1건
  {
    const heads = ['날짜', '일차', '시간', '지출명', '카테고리', '일정', '결제자', '공개 범위', '현지 금액', '통화', '환율', '원화 금액',
      '나누는 방식', '참여자', ...r.columns.map((c) => `${c} 몫`), '이 자리 정산', '입력 방식', '올린 사람'];
    const ws = wb.addWorksheet('전체 지출');
    header(ws, r, '전체 지출', heads.length);
    const body: Cell[][] = r.rows.map((x) => [
      x.date, x.day, x.time, x.title, x.category, x.schedule, x.payer, x.visibility, x.local, x.currency, x.rate,
      x.krw ?? '환율 대기', x.split, x.participants, ...x.shares, x.spot, x.input, x.uploader,
    ]);
    const counted = r.rows.filter((x) => x.krw !== null);
    const total: Cell[] = ['합계', ...new Array(10).fill(null), counted.reduce((s, x) => s + x.krw!, 0), null, null,
      ...r.columns.map((_, i) => r.rows.reduce((s, x) => s + x.shares[i], 0))];
    const num = heads.map((_, i) => (i === 10 ? '0.00' : i === 11 || (i >= 14 && i < 14 + n) ? WON : ''));
    const end = table(ws, 4, heads, body, { num }, total);
    // 현지 금액은 통화마다 소수 자리가 다르다
    r.rows.forEach((x, i) => (ws.getCell(5 + i, 9).numFmt = NO_DECIMAL.has(x.currency) ? WON : '#,##0.00'));
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: end - 2, column: heads.length } };
    widths(ws, [12, 8, 7, 26, 9, 18, 10, 9, 12, 7, 8, 13, 11, 24, ...new Array(n).fill(11), 11, 11, 10]);
  }

  // 3. 날짜별 합계
  {
    const heads = ['일차', '날짜', '대표 일정', '공동 지출 합계', ...r.columns.map((c) => `${c} 몫`), '내가 쓴 금액'];
    const ws = wb.addWorksheet('날짜별 합계');
    header(ws, r, '날짜별 합계', heads.length);
    const body: Cell[][] = r.days.map((d) => [d.day, d.date, d.schedule, d.shared, ...d.shares, d.mine]);
    const total: Cell[] = ['합계', null, null, r.totals.shared, ...r.columns.map((_, i) => r.days.reduce((s, d) => s + d.shares[i], 0)), r.totals.mine];
    table(ws, 4, heads, body, { num: heads.map((_, i) => (i >= 3 ? WON : '')) }, total);
    widths(ws, [9, 12, 20, 15, ...new Array(n).fill(12), 14]);
  }

  // 4. 사람별 정리(공동 지출만)
  {
    const ws = wb.addWorksheet('사람별 정리');
    header(ws, r, '사람별 정리', 5);
    const sum = (k: 'paid' | 'spent' | 'diff') => r.people.reduce((s, p) => s + p[k], 0);
    const end = table(ws, 4, ['이름', '역할', '결제한 돈', '쓴 돈', '차액 (+받을 돈)'],
      r.people.map((p) => [p.name, p.role, p.paid, p.spent, p.diff]),
      { num: ['', '', WON, WON, '+#,##0;-#,##0;0'], diff: 4 },
      ['합계', null, sum('paid'), sum('spent'), sum('diff')]);
    const notes = ['차액이 +면 받을 돈, −면 보낼 돈이에요. 공동 지출만 넣었어요.',
      '나만 보기 지출은 넣지 않았어요. 그래서 내 쓴 돈이 내가 쓴 금액보다 나만 보기 지출만큼 작을 수 있어요.'];
    notes.forEach((t, i) => {
      const c = ws.getCell(end + 1 + i, 1);
      c.value = t;
      c.font = { name: FONT, size: 10, color: { argb: GRAY } };
    });
    widths(ws, [16, 10, 15, 15, 16]);
  }

  // 5. 내가 쓴 금액 상세
  {
    const ws = wb.addWorksheet('내가 쓴 금액 상세');
    header(ws, r, '내가 쓴 금액 상세', 5);
    table(ws, 4, ['날짜', '지출명', '결제자', '결제 금액', '내가 쓴 금액'],
      r.mine.map((x) => [x.date, x.title, x.payer, x.krw, x.mine]),
      { num: ['', '', '', WON, WON] },
      ['합계', null, null, null, r.mine.reduce((s, x) => s + x.mine, 0)]);
    widths(ws, [12, 30, 12, 14, 14]);
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
