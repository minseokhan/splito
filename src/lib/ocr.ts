// 기기 OCR 결과를 parse-expense에 보낼 텍스트로 만든다. 못 읽은 경우를 판정해 이미지 폴백으로 돌린다.
export type OcrScript = 'latin' | 'japanese' | 'korean' | 'chinese';

// ML Kit(안드로이드)은 스크립트별로 모델이 갈려 한 번에 하나만 쓴다. 방 기본 통화를 여행지 힌트로 쓴다.
// iOS는 Apple Vision이 언어를 자동 판별하므로 이 값을 쓰지 않는다.
const SCRIPT_BY_CURRENCY: Record<string, OcrScript> = {
  JPY: 'japanese',
  KRW: 'korean',
  CNY: 'chinese',
  TWD: 'chinese',
  HKD: 'chinese',
};

export function scriptFor(baseCurrency: string): OcrScript {
  return SCRIPT_BY_CURRENCY[baseCurrency] ?? 'latin';
}

// ponytail: 글자 수 임계값은 에뮬레이터 실측 전 잠정값이다. 폴백이 과도하거나 부족하면 이 숫자만 조정한다.
const MIN_CHARS = 20;
const MAX_CHARS = 4000; // 서버 validate()의 텍스트 상한

export function ocrTextFrom(blocks: string[]): string | null {
  const text = blocks.map((b) => b.trim()).filter(Boolean).join('\n');
  if (text.length < MIN_CHARS || text.length > MAX_CHARS) return null;
  // 금액 숫자가 하나도 없으면 지출로 만들 수 없다. 흐린 감열지에서 낱글자만 잡힌 경우가 여기 걸린다.
  if (!/\d/.test(text)) return null;
  return text;
}
