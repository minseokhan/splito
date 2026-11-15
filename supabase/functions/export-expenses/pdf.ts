// 지출 내역 PDF. report.ts의 Report를 A4 세로에 그리기만 한다(계산은 report.ts가 한다).
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import type { Report } from './report.ts';

const PW = 595.28, PH = 841.89, X0 = 44, X1 = PW - 44, BOTTOM = 780;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  ink: hex('#0E1B3D'), accent: hex('#1D3C8F'), local: hex('#1668E3'), recv: hex('#0B7D6C'), send: hex('#D92D20'),
  sub: hex('#4B5563'), gray: hex('#6B7280'), light: hex('#9AA3AF'), card: hex('#F5F7FA'), hi: hex('#E8EEF9'), line: hex('#E5E7EB'),
  tagBg: hex('#EEF0F3'), spotBg: hex('#E3F8F2'), white: hex('#FFFFFF'),
};
// 앱 src/theme/tokens.ts MEMBER_COLORS와 같은 값(Edge Function은 src를 못 읽는다).
const MEMBER = [['#E8EEF8', '#1D3C8F'], ['#FFE7BF', '#8A5300'], ['#E6E3FF', '#4B3FB5'], ['#FFE2E8', '#A8324F']].map(([t, f]) => ({ tint: hex(t), fg: hex(f) }));
const SYMBOL: Record<string, string> = { JPY: '¥', USD: '$', GBP: '£' }; // €는 폰트에 없어 EUR로 적는다

const won = (n: number) => `${n.toLocaleString('en-US')}원`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${won(Math.abs(n))}`;
const local = (n: number, cur: string) => {
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return SYMBOL[cur] ? `${SYMBOL[cur]}${s}` : `${s} ${cur}`;
};

export async function renderPdf(r: Report, assets: { regular: Uint8Array; semibold: Uint8Array; logo: Uint8Array }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(r.filename('pdf').replace(/\.pdf$/, ''));
  // subset: true는 글리프를 빠뜨린다. 폰트 파일이 이미 서브셋이라 그대로 넣는다.
  const R = await doc.embedFont(assets.regular, { subset: false });
  const B = await doc.embedFont(assets.semibold, { subset: false });
  const logo = await doc.embedPng(assets.logo);
  // ponytail: 폰트가 KS X 1001 한글 2,350자까지라 그 밖의 글자(햏·이모지)는 '?'로 바꾼다. 필요하면 11,172자 전체 서브셋으로 올린다.
  const has = new Set(R.getCharacterSet());
  const clean = (s: string) => [...s].map((c) => (has.has(c.codePointAt(0)!) ? c : '?')).join('');

  let page!: PDFPage;
  let y = 0; // 위에서부터 잰 좌표
  let onBreak: (() => void) | null = null;

  const text = (s: string, x: number, base: number, size: number, font: PDFFont = R, color = C.ink, align: 'l' | 'r' = 'l') => {
    s = clean(s);
    const w = font.widthOfTextAtSize(s, size);
    page.drawText(s, { x: align === 'r' ? x - w : x, y: PH - base, size, font, color });
    return w;
  };
  const fit = (s: string, size: number, font: PDFFont, max: number) => {
    s = clean(s);
    if (font.widthOfTextAtSize(s, size) <= max) return s;
    while (s && font.widthOfTextAtSize(s + '…', size) > max) s = s.slice(0, -1);
    return s + '…';
  };
  const box = (x: number, top: number, w: number, h: number, color = C.card, rad = 8, border?: typeof C.ink) =>
    page.drawSvgPath(
      `M${x + rad},${top} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${top + rad} V${top + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${top + h} H${x + rad} A${rad},${rad} 0 0 1 ${x},${top + h - rad} V${top + rad} A${rad},${rad} 0 0 1 ${x + rad},${top} Z`,
      { x: 0, y: PH, color, borderColor: border, borderWidth: border ? 0.75 : 0 },
    );
  const rule = (top: number, thick = 0.5, color = C.line) =>
    page.drawLine({ start: { x: X0, y: PH - top }, end: { x: X1, y: PH - top }, thickness: thick, color });
  const avatar = (name: string, cx: number, cy: number, rad: number) => {
    const i = r.columns.indexOf(name);
    const c = i < 0 ? { tint: C.tagBg, fg: C.gray } : MEMBER[i % MEMBER.length];
    page.drawCircle({ x: cx, y: PH - cy, size: rad, color: c.tint });
    const ch = clean([...name][0] ?? '');
    const size = rad * 0.95;
    text(ch, cx - B.widthOfTextAtSize(ch, size) / 2, cy + size * 0.36, size, B, c.fg);
  };
  const tag = (s: string, x: number, base: number, bg: typeof C.ink, fg: typeof C.ink) => {
    const w = B.widthOfTextAtSize(s, 6.5) + 8;
    box(x, base - 7.5, w, 10.5, bg, 2);
    text(s, x + 4, base, 6.5, B, fg);
    return w;
  };

  const newPage = () => {
    page = doc.addPage([PW, PH]);
    page.drawImage(logo, { x: X0, y: PH - 57, height: 21, width: 21 * logo.width / logo.height });
    text([r.trip.name, r.trip.period.replace(/ \(.*\)$/, '')].filter(Boolean).join(' · '), X1, 53, 8, R, C.gray, 'r');
    y = 70;
  };
  const need = (h: number) => {
    if (y + h <= BOTTOM) return;
    newPage();
    onBreak?.();
  };
  const section = (title: string, right: string) => {
    text(title, X0, y + 23, 13, B);
    text(right, X1, y + 23, 7.5, R, C.gray, 'r');
    rule(y + 32, 1.5, C.ink);
    y += 42;
  };

  // 1. 요약 + 사람별 정리
  newPage();
  text('지출 내역 보고서', X0, 95, 8.5, B, C.accent);
  text(r.trip.name, X0, 122, 21, B);
  text([r.trip.period, `기본 통화 ${r.trip.baseCurrency.split(' ')[0]}`, r.meta].filter(Boolean).join(' · '), X0, 144, 9, R, C.sub);
  let cx = X0;
  y = 168;
  for (const chip of r.trip.chips) {
    const label = chip.tag ? `${chip.name} (${chip.tag})` : chip.name;
    const w = B.widthOfTextAtSize(clean(label), 8.5) + 38;
    if (cx + w > X1) (cx = X0), (y += 30);
    box(cx, y, w, 25, C.white, 12.5, C.line);
    avatar(chip.name, cx + 13, y + 12.5, 9);
    text(label, cx + 27, y + 15.5, 8.5, B);
    cx += w + 6;
  }
  y += 48;
  const cw = (X1 - X0 - 16) / 3;
  ([['총 지출 (공동)', r.totals.shared], ['여행 중 지출', r.totals.during], ['여행 전 지출', r.totals.pre]] as const).forEach(([l, v], i) => {
    const x = X0 + i * (cw + 8);
    box(x, y, cw, 53);
    text(l, x + 13, y + 18, 7.5, R, C.gray);
    text(won(v), x + 13, y + 37, 13.5, B);
  });
  y += 70;
  box(X0, y, X1 - X0, 71, C.hi);
  text('내가 쓴 금액', X0 + 13, y + 17, 7.5, B, C.accent);
  text(won(r.totals.mine), X0 + 13, y + 41, 18, B);
  text(
    `공동 지출 중 내 몫 + 나만 보기 지출이에요.${r.totals.minePre ? ` 여행 전 패키지 내 몫 ${won(r.totals.minePre)}이 포함돼 있어요.` : ''}`,
    X0 + 13, y + 57, 7.5, R, C.sub,
  );
  y += 96;
  section('사람별 정리', '공동 지출 기준');
  const peopleHead = () => {
    text('이름', X0, y + 4, 7.5, R, C.gray);
    for (const [l, x] of [['결제한 돈', 277], ['쓴 돈', 400], ['차액', X1]] as const) text(l, x, y + 4, 7.5, R, C.gray, 'r');
    rule(y + 11);
    y += 11;
  };
  peopleHead();
  onBreak = peopleHead;
  for (const p of r.people) {
    need(38);
    avatar(p.name, X0 + 10, y + 19, 10);
    text(p.name, X0 + 26, y + 23, 9.5, B);
    text(won(p.paid), 277, y + 23, 9.5, R, C.ink, 'r');
    text(won(p.spent), 400, y + 23, 9.5, R, C.ink, 'r');
    text(signed(p.diff), X1, y + 23, 9.5, B, p.diff > 0 ? C.recv : p.diff < 0 ? C.send : C.ink, 'r');
    y += 38;
    rule(y);
  }
  need(24);
  text('차액이 +면 받을 돈, -면 보낼 돈이에요. 나만 보기 지출은 넣지 않았어요.', X0, y + 17, 7.5, R, C.gray);

  // 2. 날짜별 지출 내역
  onBreak = () => section('날짜별 지출 내역', '이어서');
  newPage();
  section('날짜별 지출 내역', '결제자 기준 · 현지 금액과 원화');
  const ROW = 27;
  const expense = (e: Report['rows'][number]) => {
    need(ROW);
    text(e.time, X0, y + 16, 9.5, R, C.gray);
    const tx = X0 + 34;
    let w = text(fit(e.title, 9.5, B, 250), tx, y + 11, 9.5, B);
    if (e.visibility === '나만') w += 4 + tag('나만 보기', tx + w + 4, y + 10.5, C.tagBg, C.sub);
    if (e.spot) tag('이 자리 정산', tx + w + 4, y + 10.5, C.spotBg, C.recv);
    text(fit([e.category, e.schedule, e.split, e.participants].filter(Boolean).join(' · '), 7.5, R, 290), tx, y + 22, 7.5, R, C.gray);
    avatar(e.payer, 418, y + 13, 7);
    text(fit(e.payer, 9, R, 60), 429, y + 16, 9, R);
    if (e.currency === 'KRW') text(won(e.local), X1, y + 16, 10, B, C.ink, 'r');
    else {
      text(local(e.local, e.currency), X1, y + 11, 10, B, C.local, 'r');
      text(e.krw === null ? '환율 대기' : won(e.krw), X1, y + 22, 7.5, R, C.light, 'r');
    }
    y += ROW;
    rule(y, 0.4);
  };
  for (const d of r.days) {
    need(26 + ROW);
    const head = d.day === '여행 전' ? d.day : [d.day, d.day ? d.date.slice(5) : d.date, d.schedule].filter(Boolean).join(' · ');
    text(head, X0, y + 14, 10.5, B);
    const amt = text(won(d.shared), X1, y + 14, 8.5, B, C.sub, 'r');
    text('공동 합계 ', X1 - amt, y + 14, 8, R, C.gray, 'r');
    y += 20;
    rule(y, 0.4);
    const rows = r.rows.filter((x) => x.date === d.date);
    if (rows.some((x) => x.schedule)) {
      const groups = [...new Set(rows.map((x) => x.schedule))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1));
      for (const g of groups) {
        need(14 + ROW);
        text(g || '그 외 지출', X0, y + 11, 7.5, B, C.accent);
        y += 14;
        rows.filter((x) => x.schedule === g).forEach(expense);
      }
    } else rows.forEach(expense);
    y += 16;
  }

  // 3. 내가 쓴 금액 상세
  const mineHead = () => {
    section('내가 쓴 금액 상세', `${r.exporter} · 내가 참여한 지출만`);
    text('날짜', X0, y + 4, 7.5, R, C.gray);
    text('지출명', X0 + 42, y + 4, 7.5, R, C.gray);
    text('결제자', 284, y + 4, 7.5, R, C.gray);
    text('결제 금액', 434, y + 4, 7.5, R, C.gray, 'r');
    text('내가 쓴 금액', X1, y + 4, 7.5, R, C.gray, 'r');
    rule(y + 11);
    y += 11;
  };
  onBreak = mineHead;
  newPage();
  mineHead();
  for (const m of r.mine) {
    need(24);
    const priv = m.title.endsWith(' (나만 보기)');
    const title = priv ? m.title.slice(0, -' (나만 보기)'.length) : m.title;
    text(m.date.slice(5), X0, y + 16, 9.5, R, C.gray);
    const w = text(fit(title, 9.5, B, 180), X0 + 42, y + 16, 9.5, B);
    if (priv) tag('나만 보기', X0 + 46 + w, y + 15.5, C.tagBg, C.sub);
    text(fit(m.payer, 9.5, R, 70), 284, y + 16, 9.5, R);
    text(won(m.krw), 434, y + 16, 9.5, R, C.gray, 'r');
    text(won(m.mine), X1, y + 16, 9.5, B, C.ink, 'r');
    y += 24;
    rule(y, 0.4);
  }
  need(50);
  rule(y, 1.5, C.ink);
  text('합계', X0, y + 19, 9.5, B);
  text(won(r.totals.mine), X1, y + 20, 13, B, C.ink, 'r');
  text('품목별로 나눈 지출은 내가 고른 품목 금액만 더했어요.', X0, y + 44, 7.5, R, C.gray);

  // 4. 꼬리말
  const pages = doc.getPages();
  const foot = `Splito에서 만든 문서예요 · 환율은 지출 저장 시점 기준${r.trip.rateNote ? `(${r.trip.rateNote})` : ''}`;
  pages.forEach((p, i) => {
    page = p;
    rule(796);
    text(foot, X0, 810, 7, R, C.light);
    text(`${i + 1} / ${pages.length}`, X1, 810, 7, R, C.light, 'r');
  });
  return await doc.save();
}
