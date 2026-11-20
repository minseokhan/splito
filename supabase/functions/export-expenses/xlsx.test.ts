import { assertEquals } from 'jsr:@std/assert@1';
import ExcelJS from 'npm:exceljs@4.4.0';
import { buildReport, type ReportInput } from './report.ts';
import { renderXlsx } from './xlsx.ts';

const input: ReportInput = {
  now: new Date('2026-11-10T05:32:00Z'),
  me: { userId: 'u1', memberId: 'm1' },
  room: { name: '오사카·교토', base_currency: 'JPY', start_date: '2026-10-20', end_date: '2026-10-23', owner_id: 'u1' },
  members: [
    { id: 'm1', kind: 'user', userId: 'u1', name: '민지', leftAt: null, spotOnly: false },
    { id: 'm2', kind: 'user', userId: 'u2', name: '지훈', leftAt: null, spotOnly: false },
  ],
  expenses: [
    {
      id: 'e1', payer_kind: 'member', payer_member_id: 'm1', source: 'receipt', flags: [], merchant: '이치란 라멘',
      paid_local_date: '2026-10-20', paid_local_time: '12:40:00', currency: 'JPY', amount_original: 2000, krw_amount: 18200,
      fx_rate: 9.1, fx_source: 'kexim', visibility: 'shared', category: 'food', schedule_id: null, created_by: 'u1',
      created_at: '2026-10-20T03:40:00Z', itemized: false,
    },
    {
      id: 'e2', payer_kind: 'member', payer_member_id: 'm1', source: 'manual', flags: [], merchant: '간식',
      paid_local_date: '2026-10-21', paid_local_time: null, currency: 'KRW', amount_original: 3000, krw_amount: 3000,
      fx_rate: null, fx_source: 'krw', visibility: 'private', category: 'food', schedule_id: null, created_by: 'u1',
      created_at: '2026-10-21T03:40:00Z', itemized: false,
    },
  ],
  scope: [{ expense_id: 'e1', member_id: 'm1' }, { expense_id: 'e1', member_id: 'm2' }, { expense_id: 'e2', member_id: 'm1' }],
  shares: [
    { expense_id: 'e1', member_id: 'm1', share: 9100 },
    { expense_id: 'e1', member_id: 'm2', share: 9100 },
    { expense_id: 'e2', member_id: 'm1', share: 3000 },
  ],
  schedules: [],
  spotDone: [],
};

const load = async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await renderXlsx(buildReport(input))).buffer as ArrayBuffer);
  return wb;
};
// 시트에서 글자가 정확히 text인 셀을 찾는다
const find = (ws: ExcelJS.Worksheet, text: string) => {
  let hit: ExcelJS.Cell | undefined;
  ws.eachRow((row) => row.eachCell((c) => { if (!hit && c.value === text) hit = c; }));
  return hit!;
};
const right = (ws: ExcelJS.Worksheet, c: ExcelJS.Cell, n = 1) => ws.getRow(Number(c.row)).getCell(Number(c.col) + n);

Deno.test('시트 5개, 순서대로', async () => {
  const wb = await load();
  assertEquals(wb.worksheets.map((w) => w.name), ['요약', '전체 지출', '날짜별 합계', '사람별 정리', '내가 쓴 금액 상세']);
});

Deno.test('모든 시트에 제목과 내보낸 시각이 있다', async () => {
  const wb = await load();
  for (const ws of wb.worksheets) {
    assertEquals(String(ws.getCell('A1').value).includes('오사카·교토'), true, ws.name);
    assertEquals(ws.getCell('A2').value, '내보낸 시각 2026.11.10 14:32 · 내보낸 사람 민지');
  }
});

Deno.test('금액은 숫자 셀 + #,##0', async () => {
  const ws = (await load()).getWorksheet('요약')!;
  const mine = right(ws, find(ws, '내가 쓴 금액'));
  assertEquals(mine.value, 12100);
  assertEquals(mine.numFmt, '#,##0');
});

Deno.test('전체 지출: 사람별 몫 열과 합계 행', async () => {
  const ws = (await load()).getWorksheet('전체 지출')!;
  const head = find(ws, '민지 몫');
  assertEquals(right(ws, head).value, '지훈 몫');
  const total = find(ws, '합계');
  assertEquals(ws.getRow(Number(total.row)).getCell(Number(head.col)).value, 12100);
  assertEquals(find(ws, '나만').value, '나만');
});

Deno.test('사람별 정리: 차액 합계 0과 안내 문구', async () => {
  const ws = (await load()).getWorksheet('사람별 정리')!;
  const total = find(ws, '합계');
  assertEquals(right(ws, total, 4).value, 0);
  assertEquals(!!find(ws, '나만 보기 지출은 넣지 않았어요. 그래서 내 쓴 돈이 내가 쓴 금액보다 나만 보기 지출만큼 작을 수 있어요.'), true);
});

Deno.test('내가 쓴 금액 상세 합계 = 요약', async () => {
  const ws = (await load()).getWorksheet('내가 쓴 금액 상세')!;
  assertEquals(right(ws, find(ws, '합계'), 4).value, 12100);
  assertEquals(!!find(ws, '간식 (나만 보기)'), true);
});
