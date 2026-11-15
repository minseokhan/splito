import { assert, assertEquals } from 'jsr:@std/assert@1';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { buildReport, type ReportInput } from './report.ts';
import { renderPdf } from './pdf.ts';

const assets = {
  regular: await Deno.readFile(new URL('./assets/Pretendard-Regular-KSX.ttf', import.meta.url)),
  semibold: await Deno.readFile(new URL('./assets/Pretendard-SemiBold-KSX.ttf', import.meta.url)),
  logo: await Deno.readFile(new URL('./assets/splito-lockup-light.png', import.meta.url)),
};

const M = ['m-minji', 'm-jihun', 'm-seoyeon', 'm-mom'];
const NAMES = ['민지', '지훈', '서연', '엄마'];
const TITLES = ['이치란 라멘', '라피트 특급 4장', '오사카성 천수각 입장료', '쿠시카츠 다루마', 'USJ 익스프레스 패스', '돈키호테 도톤보리점', '햏 라멘 🍜'];

// 4일 × 7건 + 여행 전 1건 = 29건. 나만 보기·환율 대기·원화·일정·이 자리 정산이 섞인다.
function fixture(): ReportInput {
  const expenses: ReportInput['expenses'] = [];
  const scope: ReportInput['scope'] = [];
  const shares: ReportInput['shares'] = [];
  const add = (id: string, date: string, i: number, over: Partial<ReportInput['expenses'][number]> = {}) => {
    const e = {
      id, payer_kind: 'member' as const, payer_member_id: M[i % 4], source: 'receipt', flags: [], merchant: TITLES[i % TITLES.length],
      paid_local_date: date, paid_local_time: `${String(9 + i).padStart(2, '0')}:10:00`, currency: 'JPY', amount_original: 1000 * (i + 1),
      krw_amount: 9100 * (i + 1), fx_rate: 9.1, fx_source: 'kexim', visibility: 'shared' as const, category: 'food',
      schedule_id: i % 3 === 0 ? `s${date}` : null, created_by: `u${i % 4}`, created_at: `${date}T00:0${i}:00Z`, itemized: i === 2, ...over,
    };
    expenses.push(e);
    if (e.krw_amount === null) return;
    const who = e.visibility === 'private' ? [M[0]] : M;
    for (const m of who) scope.push({ expense_id: id, member_id: m });
    const each = Math.floor(e.krw_amount / who.length);
    who.forEach((m, k) => shares.push({ expense_id: id, member_id: m, share: k === 0 ? e.krw_amount! - each * (who.length - 1) : each }));
  };
  add('pre', '2026-10-19', 0, { currency: 'KRW', amount_original: 2_980_000, krw_amount: 2_980_000, fx_rate: null, merchant: '하나투어 패키지 상품 결제', schedule_id: null });
  for (const [d, date] of ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].entries()) {
    for (let i = 0; i < 7; i++) {
      const id = `e${d}${i}`;
      add(id, date, i, i === 4 ? { visibility: 'private' } : i === 5 && d === 1 ? { krw_amount: null, fx_rate: null, fx_source: 'pending' } : {});
    }
  }
  return {
    now: new Date('2026-11-10T05:32:00Z'),
    me: { userId: 'u-minji', memberId: M[0] },
    room: { name: '오사카·교토', base_currency: 'JPY', start_date: '2026-10-20', end_date: '2026-10-23', owner_id: 'u-minji' },
    members: M.map((id, i) => ({ id, kind: i === 3 ? 'guest' as const : 'user' as const, userId: i === 3 ? null : `u-${['minji', 'jihun', 'seoyeon'][i]}`, name: NAMES[i], leftAt: null, spotOnly: false })),
    expenses, scope, shares,
    schedules: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((d, i) => ({ id: `s${d}`, day_index: i + 1, start_time: '10:00', title: ['오사카성', 'USJ', '교토', '귀국'][i] })),
    spotDone: ['e11'],
  };
}

Deno.test('PDF: 4쪽 이상, 폰트에 없는 글자도 그린다', async () => {
  const report = buildReport(fixture());
  assertEquals(report.rows.length, 29);
  const bytes = await renderPdf(report, assets);
  assertEquals(new TextDecoder().decode(bytes.slice(0, 4)), '%PDF');
  const doc = await PDFDocument.load(bytes);
  assert(doc.getPageCount() >= 4, `pages ${doc.getPageCount()}`);
  const out = Deno.env.get('PDF_OUT');
  if (out) await Deno.writeFile(out, bytes);
});
