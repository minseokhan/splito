import { currencyFlag } from './flag';

describe('currencyFlag', () => {
  it('매핑된 통화는 국기 이모지를 돌려준다', () => {
    expect(currencyFlag('JPY')).toBe('🇯🇵');
  });

  it('국가를 특정할 수 없는 통화와 미매핑 통화는 null (호출부가 비행기로 대체)', () => {
    expect(currencyFlag('EUR')).toBeNull();
    expect(currencyFlag('XYZ')).toBeNull();
    expect(currencyFlag(null)).toBeNull();
  });

  it('소문자·공백은 정규화한다', () => {
    expect(currencyFlag(' krw ')).toBe('🇰🇷');
  });
});
