import { BANKS, CHANGE_BANKS, FAVORITE_BANK_COUNT, accountDigits, accountNumberSchema, searchBanks } from './bank';

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

describe('CHANGE_BANKS — 계좌 변경 시트 목록(자주 쓰는 은행 4 + 전체 은행 18)', () => {
  it('자주 쓰는 은행이 앞에 온다', () => {
    expect(CHANGE_BANKS.slice(0, FAVORITE_BANK_COUNT).map((b) => b.name)).toEqual(['토스뱅크', '카카오뱅크', 'KB국민은행', '신한은행']);
  });

  it('22개, 증권사는 없다', () => {
    expect(CHANGE_BANKS).toHaveLength(22);
    expect(CHANGE_BANKS.some((b) => b.name.endsWith('증권'))).toBe(false);
  });
});

describe('searchBanks — 공백 무시 부분 일치', () => {
  it('빈 검색어면 전체 목록', () => {
    expect(searchBanks('')).toEqual(CHANGE_BANKS);
    expect(searchBanks('  ')).toEqual(CHANGE_BANKS);
  });

  it.each([
    ['국민', ['KB국민은행']],
    ['카카오 뱅크', ['카카오뱅크']],
    ['kb', ['KB국민은행']],
    ['대구', ['대구은행(iM뱅크)']],
    ['씨티', ['한국씨티은행']],
    ['없는은행', []],
  ])('%j → %j', (q, names) => {
    expect(searchBanks(q).map((b) => b.name)).toEqual(names);
  });
});

describe('accountDigits — 숫자만, 최대 14자리', () => {
  it.each([
    ['3333-01-1234567', '3333011234567'],
    [' 1000 1234 5678 ', '100012345678'],
    ['1'.repeat(20), '1'.repeat(14)],
    ['abc', ''],
  ])('%j → %j', (input, out) => {
    expect(accountDigits(input)).toBe(out);
  });
});
