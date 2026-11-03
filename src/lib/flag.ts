// 방에는 국가 컬럼이 없다. 홈 카드 국기는 기본 통화에서 유도한다(사용자 결정).
// 한 나라로 특정되지 않는 통화(EUR)와 매핑에 없는 통화는 null — 호출부가 비행기 아이콘으로 대체한다.
const COUNTRY: Record<string, string> = {
  KRW: 'KR', JPY: 'JP', USD: 'US', VND: 'VN', THB: 'TH', TWD: 'TW', SGD: 'SG',
  HKD: 'HK', CNY: 'CN', PHP: 'PH', MYR: 'MY', IDR: 'ID', GBP: 'GB', AUD: 'AU',
  CAD: 'CA', CHF: 'CH', NZD: 'NZ',
};

const REGIONAL_A = 0x1f1e6; // 🇦 — 'A'(65)부터 순서대로 대응한다

export function currencyFlag(currency: string | null | undefined): string | null {
  const country = COUNTRY[(currency ?? '').trim().toUpperCase()];
  if (!country) return null;
  return String.fromCodePoint(...[...country].map((c) => REGIONAL_A + c.charCodeAt(0) - 65));
}
