import { ocrTextFrom, scriptFor } from './ocr';

describe('scriptFor', () => {
  it('방 기본 통화로 ML Kit 스크립트를 고른다', () => {
    expect(scriptFor('JPY')).toBe('japanese');
    expect(scriptFor('KRW')).toBe('korean');
    expect(scriptFor('CNY')).toBe('chinese');
    expect(scriptFor('TWD')).toBe('chinese');
    expect(scriptFor('HKD')).toBe('chinese');
  });

  it('모르는 통화·유럽·미국은 라틴으로 떨어진다', () => {
    expect(scriptFor('USD')).toBe('latin');
    expect(scriptFor('EUR')).toBe('latin');
    expect(scriptFor('THB')).toBe('latin');
    expect(scriptFor('')).toBe('latin');
  });
});

describe('ocrTextFrom', () => {
  const receipt = ['一蘭 難波店', 'ラーメン 2 ¥1,640', '合計 ¥3,280'];

  it('블록을 줄바꿈으로 합친다', () => {
    expect(ocrTextFrom(receipt)).toBe('一蘭 難波店\nラーメン 2 ¥1,640\n合計 ¥3,280');
  });

  it('빈 블록과 공백만 있는 블록은 버린다', () => {
    expect(ocrTextFrom(['', '  ', ...receipt, '\n'])).toBe(ocrTextFrom(receipt));
  });

  it('글자를 거의 못 읽었으면 null (이미지 폴백)', () => {
    expect(ocrTextFrom([])).toBeNull();
    expect(ocrTextFrom(['', ' '])).toBeNull();
    expect(ocrTextFrom(['ラ', '合'])).toBeNull();
  });

  it('숫자가 하나도 없으면 null — 금액 없는 글자는 지출로 못 만든다', () => {
    expect(ocrTextFrom(['一蘭 難波店 ラーメン とんこつ 替玉 ごはん セット'])).toBeNull();
  });

  it('4,000자를 넘으면 null — 서버 텍스트 상한이 4,000자다', () => {
    expect(ocrTextFrom(['1' + 'あ'.repeat(3999)])).not.toBeNull();
    expect(ocrTextFrom(['1' + 'あ'.repeat(4000)])).toBeNull();
  });
});
