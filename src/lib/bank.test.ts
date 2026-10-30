import { BANKS, accountNumberSchema } from './bank';

describe('BANKS', () => {
  it('20개 이상, 코드·이름이 겹치지 않는다', () => {
    expect(BANKS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(BANKS.map((b) => b.code)).size).toBe(BANKS.length);
    expect(new Set(BANKS.map((b) => b.name)).size).toBe(BANKS.length);
  });

  it('주요 은행·인터넷은행·증권을 포함한다', () => {
    const names = BANKS.map((b) => b.name);
    expect(names).toEqual(expect.arrayContaining(['KB국민은행', '카카오뱅크', '토스뱅크', '미래에셋증권']));
  });
});

describe('accountNumberSchema — 숫자·하이픈, 숫자 8~20자리 (서버 set_payout_account와 같은 규칙)', () => {
  it.each([
    ['3333011234567', true],
    ['3333-01-1234567', true],
    ['  3333-01-1234567  ', true],
    ['1234567', false],
    ['12345678', true],
    ['1'.repeat(20), true],
    ['1'.repeat(21), false],
    ['1234-5678-', true],
    ['--------', false],
    ['3333 01 1234567', false],
    ['3333-01-12345a7', false],
    ['', false],
  ])('%j → %s', (input, ok) => {
    expect(accountNumberSchema.safeParse(input).success).toBe(ok);
  });

  it('앞뒤 공백을 지운 값을 돌려준다', () => {
    expect(accountNumberSchema.parse(' 3333-01-1234567 ')).toBe('3333-01-1234567');
  });
});
