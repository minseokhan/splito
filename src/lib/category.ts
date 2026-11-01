// 지출 카테고리. DB expenses.category의 check 제약과 코드가 같아야 한다.
export const CATEGORIES = [
  { code: 'food', label: '식비' },
  { code: 'shopping', label: '쇼핑' },
  { code: 'sightseeing', label: '관광' },
  { code: 'lodging', label: '숙소' },
  { code: 'transport', label: '교통' },
  { code: 'other', label: '기타' },
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]['code'];

// AI 응답·옛 데이터를 그대로 믿지 않는다. 모르는 값은 기타로 접는다.
export function toCategory(v: unknown): CategoryCode {
  return CATEGORIES.some((c) => c.code === v) ? (v as CategoryCode) : 'other';
}

export function categoryLabel(v: unknown): string {
  return CATEGORIES.find((c) => c.code === v)?.label ?? '기타';
}
