// 미리보기·표시 전용. 원화 확정과 박스 배분의 정답은 서버 save_expense다(ADR-006).
import { CURRENCIES } from './currency';
import type { FxSource } from '../types/domain';

// Math.round는 −2.5 → −2라 쓰지 않는다.
export function roundHalfAwayFromZero(x: number): number {
  const abs = Math.abs(x);
  const fl = Math.floor(abs);
  const r = abs - fl >= 0.5 ? fl + 1 : fl;
  return x < 0 && r !== 0 ? -r : r;
}

// 정수 전제. a − ((a mod b)를 b 부호로 맞춘 값)은 b로 나누어떨어진다.
export function floorDiv(a: number, b: number): number {
  const r = ((a % b) + b) % b;
  return (a - r) / b;
}

function bigFloorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return (a % b !== 0n) && ((a < 0n) !== (b < 0n)) ? q - 1n : q;
}

// 외화 원본은 ×1000(소수 3자리), 환율은 ×1e6(numeric(18,6))로 정수화해 BigInt로 계산한다.
export function toKrwPreview(amountOriginal: number, ratePerUnit: number): number {
  const n = BigInt(roundHalfAwayFromZero(amountOriginal * 1000)) * BigInt(roundHalfAwayFromZero(ratePerUnit * 1e6));
  const d = 1_000_000_000n;
  const abs = n < 0n ? -n : n;
  const q = (abs * 2n + d) / (2n * d);
  return Number(n < 0n ? -q : q);
}

// save_expense의 _allocate_items와 같은 규칙: 몫 floor, 나머지 큰 순, 동점이면 position 순.
export function allocateLargestRemainder(totalKrw: number, items: { position: number; amount: number }[]): number[] {
  const milli = items.map((i) => BigInt(roundHalfAwayFromZero(i.amount * 1000)));
  const d = milli.reduce((a, b) => a + b, 0n);
  if (d <= 0n) throw new RangeError('AMOUNT_INVALID');
  const total = BigInt(totalKrw);
  const rows = items.map((it, idx) => {
    const n = total * milli[idx];
    const fl = bigFloorDiv(n, d);
    return { idx, position: it.position, fl, rem: n - fl * d };
  });
  let rest = total - rows.reduce((a, r) => a + r.fl, 0n);
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? a.position - b.position : a.rem > b.rem ? -1 : 1));
  const out = rows.map((r) => r.fl);
  for (const r of order) {
    if (rest <= 0n) break;
    out[r.idx] += 1n;
    rest -= 1n;
  }
  return out.map(Number);
}

export function splitEvenly(boxKrw: number, n: number): { perPerson: number; remainder: number } {
  const perPerson = floorDiv(boxKrw, n);
  return { perPerson, remainder: boxKrw - perPerson * n };
}

function withCommas(intAbs: number): string {
  return String(intAbs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatKrw(krw: number): string {
  return `${krw < 0 ? '-' : ''}${withCommas(Math.abs(krw))}원`;
}

const ZERO_DECIMAL = new Set(['KRW', 'JPY', 'VND', 'IDR']);

export function formatForeign(amount: number, currency: string): string {
  const c = CURRENCIES.find((x) => x.code === currency);
  const symbol = c ? c.symbol : `${currency} `;
  const dec = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const scale = 10 ** dec;
  const milli = roundHalfAwayFromZero(Math.abs(amount) * 1000);
  const v = roundHalfAwayFromZero(milli / 10 ** (3 - dec));
  const int = floorDiv(v, scale);
  const frac = dec ? `.${String(v - int * scale).padStart(dec, '0')}` : '';
  return `${amount < 0 ? '-' : ''}${symbol}${withCommas(int)}${frac}`;
}

// "미국 달러" → "달러". 끝 단어가 겹치는 달러류(홍콩 달러 등)는 전체 이름을 쓴다.
export function unitName(code: string, label: string): string {
  const last = label.split(' ').pop() ?? label;
  return last === '달러' && code !== 'USD' ? label : last;
}

export function fxBasisLabel(p: { source: FxSource; baseDate?: string; rate?: number; currency: string }): string {
  switch (p.source) {
    case 'krw':
      return '원화 결제';
    case 'card_krw':
      return '승인 문자 청구액 · 승인 시점 금액';
    case 'manual':
      return '수동 입력';
    case 'pending':
      return '환율 대기';
    case 'kexim': {
      const c = CURRENCIES.find((x) => x.code === p.currency);
      const unit = c?.unit ?? 1;
      const name = c ? unitName(c.code, c.label) : p.currency;
      const [, m, d] = (p.baseDate ?? '').split('-');
      const centi = roundHalfAwayFromZero((roundHalfAwayFromZero((p.rate ?? 0) * 1e6) * unit) / 1e4);
      const int = floorDiv(centi, 100);
      const frac = centi - int * 100;
      const fracStr = frac ? `.${String(frac).padStart(2, '0').replace(/0$/, '')}` : '';
      return `${Number(m)}/${Number(d)} 매매기준율 · ${unit}${name} = ${withCommas(int)}${fracStr}원`;
    }
  }
}
