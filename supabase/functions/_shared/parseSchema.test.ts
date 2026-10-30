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
