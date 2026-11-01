import { CATEGORIES, categoryLabel, toCategory } from './category';

describe('CATEGORIES', () => {
  it('식비·쇼핑·관광·숙소·교통·기타 6개를 이 순서로 둔다', () => {
    expect(CATEGORIES.map((c) => c.code)).toEqual(['food', 'shopping', 'sightseeing', 'lodging', 'transport', 'other']);
    expect(CATEGORIES.map((c) => c.label)).toEqual(['식비', '쇼핑', '관광', '숙소', '교통', '기타']);
  });
});

describe('toCategory', () => {
  it('아는 코드는 그대로 돌려준다', () => {
    expect(toCategory('food')).toBe('food');
    expect(toCategory('transport')).toBe('transport');
  });

  // AI 응답·옛 데이터는 믿을 수 없다. DB check 제약에 걸리기 전에 기타로 접는다.
  it('모르는 값·null·타입이 다른 값은 기타로 접는다', () => {
    expect(toCategory('cafe')).toBe('other');
    expect(toCategory(null)).toBe('other');
    expect(toCategory(undefined)).toBe('other');
    expect(toCategory(3)).toBe('other');
  });
});

describe('categoryLabel', () => {
  it('코드를 한국어 라벨로 바꾼다', () => {
    expect(categoryLabel('lodging')).toBe('숙소');
  });

  it('모르는 값은 기타', () => {
    expect(categoryLabel(null)).toBe('기타');
  });
});
