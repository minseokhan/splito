import {
  allocateLargestRemainder,
  unitName,
  floorDiv,
  formatForeign,
  formatKrw,
  fxBasisLabel,
  roundHalfAwayFromZero,
  splitEvenly,
  toKrwPreview,
} from './money';

describe('roundHalfAwayFromZero', () => {
  it('0.5는 0에서 멀어지는 쪽', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(0.4999)).toBe(0);
    expect(roundHalfAwayFromZero(-0.4999)).toBe(0);
    expect(roundHalfAwayFromZero(0.49999999999999994)).toBe(0);
    expect(roundHalfAwayFromZero(-7)).toBe(-7);
  });
});

describe('floorDiv', () => {
  it('음수도 floor', () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(-6, 2)).toBe(-3);
    expect(floorDiv(7, -2)).toBe(-4);
    expect(floorDiv(0, 3)).toBe(0);
  });
});

describe('toKrwPreview', () => {
  it('정수 스케일로 반올림', () => {
    expect(toKrwPreview(3280, 9.1234)).toBe(29925); // 29924.752
    expect(toKrwPreview(12.5, 1328)).toBe(16600);
    expect(toKrwPreview(0.1, 1335)).toBe(134); // 133.5 → 134 (float이면 133.49…)
    expect(toKrwPreview(1.005, 1000)).toBe(1005);
    expect(toKrwPreview(10000, 1)).toBe(10000);
  });
});

describe('allocateLargestRemainder', () => {
  it('비율 배분, 합은 total', () => {
    expect(
      allocateLargestRemainder(10000, [
        { position: 0, amount: 1 },
        { position: 1, amount: 1 },
        { position: 2, amount: 1 },
      ]),
    ).toEqual([3334, 3333, 3333]);
  });

  it('동점이면 position 작은 순 (입력 순서와 무관)', () => {
    expect(
      allocateLargestRemainder(10, [
        { position: 2, amount: 1 },
        { position: 0, amount: 1 },
        { position: 1, amount: 1 },
      ]),
    ).toEqual([3, 4, 3]);
  });

  it('나머지가 큰 박스가 먼저', () => {
    // 100 × [1,2,4]/7 = 14.28, 28.57, 57.14 → 14, 29, 57
    expect(
      allocateLargestRemainder(100, [
        { position: 0, amount: 1 },
        { position: 1, amount: 2 },
        { position: 2, amount: 4 },
      ]),
    ).toEqual([14, 29, 57]);
  });

  it('음수 할인 박스', () => {
    // 1000 × [1500, -500]/1000 → 1500, -500
    expect(
      allocateLargestRemainder(1000, [
        { position: 0, amount: 15 },
        { position: 1, amount: -5 },
      ]),
    ).toEqual([1500, -500]);
    const r = allocateLargestRemainder(1001, [
      { position: 0, amount: 3.33 },
      { position: 1, amount: -1.11 },
      { position: 2, amount: 0.001 },
    ]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(r[1]).toBeLessThan(0);
  });

  it('무작위 100케이스: 합 일치, 각 박스는 floor 또는 floor+1', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let t = 0; t < 100; t++) {
      const n = 1 + Math.floor(rnd() * 8);
      const items = Array.from({ length: n }, (_, i) => ({
        position: i,
        amount: Math.floor(rnd() * 1_000_000) / 1000 - (rnd() < 0.2 ? 100 : 0),
      }));
      const sum = items.reduce((a, b) => a + Math.round(b.amount * 1000), 0);
      if (sum <= 0) items.push({ position: n, amount: (-sum + 1000) / 1000 });
      const total = Math.floor(rnd() * 10_000_000);
      const r = allocateLargestRemainder(total, items);
      expect(r.reduce((a, b) => a + b, 0)).toBe(total);
      r.forEach((v) => expect(Number.isInteger(v)).toBe(true));
    }
  });

  it('원본 합계 ≤ 0이면 에러', () => {
    expect(() => allocateLargestRemainder(100, [{ position: 0, amount: 0 }])).toThrow();
  });
});

describe('splitEvenly', () => {
  it('floor, remainder ≥ 0', () => {
    expect(splitEvenly(10000, 3)).toEqual({ perPerson: 3333, remainder: 1 });
    expect(splitEvenly(-1000, 3)).toEqual({ perPerson: -334, remainder: 2 });
    expect(splitEvenly(9, 3)).toEqual({ perPerson: 3, remainder: 0 });
  });
});

describe('formatKrw', () => {
  it('천 단위 콤마 + 원', () => {
    expect(formatKrw(132000)).toBe('132,000원');
    expect(formatKrw(0)).toBe('0원');
    expect(formatKrw(999)).toBe('999원');
    expect(formatKrw(1234567)).toBe('1,234,567원');
    expect(formatKrw(-5000)).toBe('-5,000원');
  });
});

describe('formatForeign', () => {
  it('통화 기호와 소수 자리', () => {
    expect(formatForeign(3280, 'JPY')).toBe('¥3,280');
    expect(formatForeign(12.5, 'USD')).toBe('$12.50');
    expect(formatForeign(1234.005, 'EUR')).toBe('€1,234.01');
    expect(formatForeign(50000, 'IDR')).toBe('Rp50,000');
    expect(formatForeign(-3, 'USD')).toBe('-$3.00');
    expect(formatForeign(10, 'XYZ')).toBe('XYZ 10.00');
  });
});

describe('fxBasisLabel', () => {
  it('kexim 근거', () => {
    expect(fxBasisLabel({ source: 'kexim', baseDate: '2026-10-21', rate: 1328, currency: 'USD' })).toBe(
      '10/21 매매기준율 · 1달러 = 1,328원',
    );
    expect(fxBasisLabel({ source: 'kexim', baseDate: '2026-10-21', rate: 9.1234, currency: 'JPY' })).toBe(
      '10/21 매매기준율 · 100엔 = 912.34원',
    );
    expect(fxBasisLabel({ source: 'kexim', baseDate: '2026-01-05', rate: 0.0861, currency: 'IDR' })).toBe(
      '1/5 매매기준율 · 100루피아 = 8.61원',
    );
    expect(fxBasisLabel({ source: 'kexim', baseDate: '2026-10-21', rate: 180.5, currency: 'HKD' })).toBe(
      '10/21 매매기준율 · 1홍콩 달러 = 180.5원',
    );
  });

  it('그 외 근거', () => {
    expect(fxBasisLabel({ source: 'krw', currency: 'KRW' })).toBe('원화 결제');
    expect(fxBasisLabel({ source: 'card_krw', currency: 'USD' })).toBe('승인 문자 청구액 · 승인 시점 금액');
    expect(fxBasisLabel({ source: 'manual', rate: 25, currency: 'TWD' })).toBe('수동 입력');
    expect(fxBasisLabel({ source: 'pending', currency: 'USD' })).toBe('환율 대기');
  });
});

describe('unitName', () => {
  test('통화 이름의 마지막 단어(원·엔)를 짧은 이름으로 쓴다', () => {
    expect(unitName('KRW', '대한민국 원')).toBe('원');
    expect(unitName('JPY', '일본 엔')).toBe('엔');
    expect(unitName('USD', '미국 달러')).toBe('달러');
  });
  test('USD가 아닌 달러는 나라 이름까지 쓴다', () => {
    expect(unitName('AUD', '호주 달러')).toBe('호주 달러');
  });
});
