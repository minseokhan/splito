import { isValidBookingNo, maskHolder, normalizeBookingNo, perPersonPreview, prepayAmount } from './booking';

describe('normalizeBookingNo', () => {
  it('공백을 지우고 대문자로 바꾼다', () => {
    expect(normalizeBookingNo(' ht2410-58213 ')).toBe('HT2410-58213');
  });
  it('12자를 넘으면 자른다', () => {
    expect(normalizeBookingNo('HT2410-58213999')).toBe('HT2410-58213');
  });
});

describe('isValidBookingNo', () => {
  it.each(['HT2410-58213', 'AB0000-00000'])('%s는 유효하다', (v) => {
    expect(isValidBookingNo(v)).toBe(true);
  });
  it.each(['', 'HT2410', 'HT241-58213', 'H12410-58213', 'HT2410-5821'])('%s는 유효하지 않다', (v) => {
    expect(isValidBookingNo(v)).toBe(false);
  });
});

describe('maskHolder', () => {
  it('가운데 한 글자를 가린다', () => {
    expect(maskHolder('이민지')).toBe('이*지');
  });
  it('네 글자 이상이면 가운데를 모두 가린다', () => {
    expect(maskHolder('남궁민지')).toBe('남**지');
  });
  it('두 글자는 뒤를 가린다', () => {
    expect(maskHolder('김철')).toBe('김*');
  });
  it('한 글자는 그대로 둔다', () => {
    expect(maskHolder('이')).toBe('이');
  });
  it('앞뒤 공백은 떼고 센다', () => {
    expect(maskHolder('  이민지  ')).toBe('이*지');
  });
});

describe('prepayAmount', () => {
  it('일행 몫도 함께 결제했으면 결제 금액 전체를 등록한다', () => {
    expect(prepayAmount(2_980_000, 4, true)).toBe(2_980_000);
  });
  it('내 몫만이면 예약 인원으로 나눈 금액만 등록한다', () => {
    expect(prepayAmount(2_980_000, 4, false)).toBe(745_000);
  });
  it('나눠떨어지지 않으면 floor한다(자투리는 결제자 몫으로 남는다)', () => {
    expect(prepayAmount(1_000, 3, false)).toBe(333);
  });
  it('예약 인원이 0이어도 터지지 않는다', () => {
    expect(prepayAmount(1_000, 0, false)).toBe(1_000);
  });
});

describe('perPersonPreview', () => {
  it('1인당 금액을 보여준다', () => {
    expect(perPersonPreview(2_980_000, 4)).toBe(745_000);
  });
  it('예약 인원이 1명이면 전액', () => {
    expect(perPersonPreview(2_980_000, 1)).toBe(2_980_000);
  });
});
