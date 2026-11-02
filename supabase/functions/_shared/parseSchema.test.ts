import { assertEquals } from 'jsr:@std/assert@1';
import { ParsedExpense, parsedExpenseJsonSchema } from './parseSchema.ts';

Deno.test('zod와 JSON schema의 필드 목록이 같다', () => {
  assertEquals(Object.keys(ParsedExpense.shape).sort(), [...parsedExpenseJsonSchema.required].sort());
  assertEquals(
    Object.keys(ParsedExpense.shape.items.element.shape).sort(),
    [...parsedExpenseJsonSchema.properties.items.items.required].sort(),
  );
});

Deno.test('품목명 81자는 zod에서 거부', () => {
  const item = { name_original: 'a'.repeat(81), name_ko: 'a', quantity: 1, amount: 1, confidence: 'high' };
  const r = ParsedExpense.safeParse({
    is_receipt: true, merchant: null, paid_local_date: null, paid_local_time: null, currency: null,
    currency_ambiguous: false, total: null, krw_charged: null, card_last4: null, items: [item], confidence: 'high',
  });
  assertEquals(r.success, false);
});

// 표시용 필드 하나가 형식을 벗어났다고 지출 전체를 버리면 안 된다(PARSE_INVALID로 죽는다).
// 실제 사례: 결제앱이 카드번호를 '4028-78**-****-724*'로 마스킹해 끝 4자리가 '724*'로 읽힌다.
Deno.test('형식에 안 맞는 표시용 필드는 null로 접고 금액은 살린다', () => {
  const base = {
    is_receipt: true, merchant: 'CHARICHARI', currency_ambiguous: false,
    total: 728, krw_charged: 6957, items: [], confidence: 'high',
  };
  for (
    const bad of [
      { card_last4: '724*' },
      { paid_local_time: '20:48:20.5' },
      { paid_local_date: '2025/10/02' },
      { currency: '¥' },
    ]
  ) {
    const r = ParsedExpense.safeParse({
      paid_local_date: null, paid_local_time: null, currency: null, card_last4: null, ...base, ...bad,
    });
    assertEquals(r.success, true, `거부됨: ${JSON.stringify(bad)}`);
    assertEquals(r.data!.total, 728);
    assertEquals(r.data![Object.keys(bad)[0] as 'card_last4'], null);
  }
});
