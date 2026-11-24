import { historyStamp } from './history';

describe('historyStamp', () => {
  it('기기 현지 시각을 "10/22 21:14"로', () => {
    expect(historyStamp(new Date(2026, 9, 22, 21, 14).toISOString())).toBe('10/22 21:14');
    expect(historyStamp(new Date(2026, 0, 3, 7, 5).toISOString())).toBe('1/3 07:05');
  });
});
