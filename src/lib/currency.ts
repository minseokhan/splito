// unit: 환율 근거 표기 단위(100엔 = 912.34원). 환율 값은 서버 fx_rates만 쓴다.
export const CURRENCIES: readonly { code: string; label: string; unit: 1 | 100; symbol: string }[] = [
  { code: 'KRW', label: '대한민국 원', unit: 1, symbol: '₩' },
  { code: 'JPY', label: '일본 엔', unit: 100, symbol: '¥' },
  { code: 'USD', label: '미국 달러', unit: 1, symbol: '$' },
  { code: 'EUR', label: '유로', unit: 1, symbol: '€' },
  { code: 'CNY', label: '중국 위안', unit: 1, symbol: '¥' },
  { code: 'HKD', label: '홍콩 달러', unit: 1, symbol: 'HK$' },
  { code: 'TWD', label: '대만 달러', unit: 1, symbol: 'NT$' },
  { code: 'THB', label: '태국 바트', unit: 1, symbol: '฿' },
  { code: 'VND', label: '베트남 동', unit: 1, symbol: '₫' },
  { code: 'PHP', label: '필리핀 페소', unit: 1, symbol: '₱' },
  { code: 'SGD', label: '싱가포르 달러', unit: 1, symbol: 'S$' },
  { code: 'IDR', label: '인도네시아 루피아', unit: 100, symbol: 'Rp' },
  { code: 'AUD', label: '호주 달러', unit: 1, symbol: 'A$' },
  { code: 'GBP', label: '영국 파운드', unit: 1, symbol: '£' },
  { code: 'CAD', label: '캐나다 달러', unit: 1, symbol: 'C$' },
  { code: 'CHF', label: '스위스 프랑', unit: 1, symbol: 'CHF' },
];

const CODES = new Set(CURRENCIES.map((c) => c.code));

export function isCurrencyCode(v: string): boolean {
  return CODES.has(v);
}
