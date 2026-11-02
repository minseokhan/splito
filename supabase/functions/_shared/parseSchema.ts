import { z } from 'npm:zod@4';

// parse-expense 응답 스키마. 앱 쪽 스키마와는 fixture 테스트로 일치를 확인한다(ARCHITECTURE §1).
// paid_local_date는 모델 출력 단계에서만 '--MM-DD'(연도 없음)를 허용하고, 후처리가 연도를 채운다.
const confidence = z.enum(['high', 'low']);
const CATEGORIES = ['food', 'shopping', 'sightseeing', 'lodging', 'transport', 'other'] as const;

export const ParsedExpense = z.object({
  is_receipt: z.boolean(),
  merchant: z.string().nullable(),
  // 형식을 벗어난 값은 거부하지 않고 null로 접는다. 표시용 필드 하나 때문에 금액까지 버리면 안 된다.
  // null이어도 뒤에서 메워진다 — currency는 postprocess가 base_currency로, 날짜는 클라이언트가 오늘로(확인 필요 표시).
  paid_local_date: z.string().regex(/^(\d{4}|-)-\d{2}-\d{2}$/).nullable().catch(null),
  paid_local_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().catch(null),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable().catch(null),
  currency_ambiguous: z.boolean(),
  total: z.number().nullable(),
  krw_charged: z.number().nullable(),
  // 결제앱이 끝자리까지 마스킹하면 '724*'처럼 읽힌다(공금 카드 매칭만 못 할 뿐이다).
  card_last4: z.string().regex(/^\d{4}$/).nullable().catch(null),
  // 모르는 값·누락은 거부하지 않고 'other'로 접는다(DB check 제약과 같은 코드 집합).
  category: z.enum(CATEGORIES).catch('other'),
  // 이미지일 때만 채운다. optional이라 이 필드를 모르는 구 버전 응답도 그대로 통과한다.
  photo_kind: z.enum(['receipt', 'capture']).nullable().optional(),
  items: z.array(z.object({
    name_original: z.string().max(80),
    name_ko: z.string().max(80),
    quantity: z.number(),
    amount: z.number(),
    confidence,
  })),
  confidence,
});
export type ParsedExpense = z.infer<typeof ParsedExpense>;

// Claude 구조화 출력용. 길이·패턴 제약은 API가 받지 않으므로 설명으로 안내하고 zod로 다시 검증한다.
const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) });
const nullable = (s: object) => ({ anyOf: [s, { type: 'null' }] });
const conf = { type: 'string', enum: ['high', 'low'] };

export const parsedExpenseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_receipt', 'merchant', 'paid_local_date', 'paid_local_time', 'currency', 'currency_ambiguous',
    'total', 'krw_charged', 'card_last4', 'category', 'photo_kind', 'items', 'confidence',
  ],
  properties: {
    is_receipt: { type: 'boolean' },
    merchant: nullable(str()),
    paid_local_date: nullable(str('YYYY-MM-DD. 연도가 없으면 --MM-DD')),
    paid_local_time: nullable(str('HH:MM (24시간)')),
    currency: nullable(str('ISO 4217 코드')),
    currency_ambiguous: { type: 'boolean' },
    total: nullable({ type: 'number' }),
    krw_charged: nullable({ type: 'number' }),
    card_last4: nullable(str('카드 끝 4자리 숫자')),
    category: { type: 'string', enum: [...CATEGORIES] },
    photo_kind: nullable({ type: 'string', enum: ['receipt', 'capture'], description: '이미지일 때만. 텍스트면 null' }),
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name_original', 'name_ko', 'quantity', 'amount', 'confidence'],
        properties: {
          name_original: str('80자 이하'),
          name_ko: str('80자 이하'),
          quantity: { type: 'number' },
          amount: { type: 'number', description: '이 줄의 합계 금액(단가 × 수량). 할인은 음수' },
          confidence: conf,
        },
      },
    },
    confidence: conf,
  },
} as const;
