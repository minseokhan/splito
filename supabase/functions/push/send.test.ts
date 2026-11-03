import { assertEquals } from 'jsr:@std/assert@1';
import { chunk, deadTokens } from './send.ts';

Deno.test('chunk는 100개 단위로 자른다', () => {
  const xs = Array.from({ length: 250 }, (_, i) => i);
  assertEquals(chunk(xs).map((c) => c.length), [100, 100, 50]);
  assertEquals(chunk([]), []);
});

Deno.test('DeviceNotRegistered 토큰만 지운다', () => {
  const tokens = ['t0', 't1', 't2', 't3'];
  const tickets = [
    { status: 'ok' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', details: { error: 'MessageRateExceeded' } },
    { status: 'error' },
  ];
  assertEquals(deadTokens(tokens, tickets), ['t1']);
});

Deno.test('티켓이 모자라면 아무것도 지우지 않는다', () => {
  assertEquals(deadTokens(['t0', 't1'], []), []);
});
