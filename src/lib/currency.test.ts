import { CURRENCIES, isCurrencyCode } from './currency';

describe('CURRENCIES', () => {
  it('코드 중복 없음', () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('필수 16종 포함', () => {
    expect(CURRENCIES.map((c) => c.code).sort()).toEqual(
      ['KRW', 'JPY', 'USD', 'EUR', 'CNY', 'HKD', 'TWD', 'THB', 'VND', 'PHP', 'SGD', 'IDR', 'AUD', 'GBP', 'CAD', 'CHF'].sort(),
    );
  });

  it('JPY·IDR만 100단위', () => {
    expect(CURRENCIES.filter((c) => c.unit === 100).map((c) => c.code).sort()).toEqual(['IDR', 'JPY']);
  });

  it('모든 코드는 ISO 4217 3자리 대문자, 라벨·기호 있음', () => {
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.label).not.toBe('');
      expect(c.symbol).not.toBe('');
    }
  });
});

describe('isCurrencyCode', () => {
  it.each([
    ['KRW', true],
    ['JPY', true],
    ['krw', false],
    ['CNH', false],
    ['XYZ', false],
    ['', false],
  ])('%s → %s', (v, ok) => {
    expect(isCurrencyCode(v)).toBe(ok);
  });
});
