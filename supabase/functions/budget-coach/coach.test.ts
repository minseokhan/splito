import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { BUDGET_CATEGORIES, type ClaudeResult, coachBudget, type Deps, normalizeTo, ratiosFrom } from './coach.ts';

const ROOM = '11111111-1111-4111-8111-111111111111';
const SPENT = { food: 182_400, transport: 38_400, shopping: 144_000, sightseeing: 96_000, other: 19_200 };

const reply = (body: unknown, stop_reason = 'end_turn'): ClaudeResult => ({
  stop_reason,
  text: typeof body === 'string' ? body : JSON.stringify(body),
});

function fake(replies: ClaudeResult[], over: Partial<Deps> = {}) {
  const calls: unknown[] = [];
  const deps: Deps = {
    model: 'test-model',
    consumeQuota: () => Promise.resolve(null),
    callClaude: (params) => {
      calls.push(params);
      const r = replies.shift();
      if (!r) throw new Error('no more replies');
      return Promise.resolve(r);
    },
    ...over,
  };
  return { deps, calls };
}

const sum = (o: Record<string, number> | number[]) => Object.values(o).reduce((a, b) => a + b, 0);

Deno.test('normalizeTo: 가중치대로 나누고 합을 정확히 맞춘다', () => {
  const out = normalizeTo(100_000, [1, 1, 1]);
  assertEquals(sum(out), 100_000);
  assertEquals(out, [33_334, 33_333, 33_333]);
});

Deno.test('normalizeTo: 가중치가 전부 0이면 고르게 나눈다', () => {
  assertEquals(normalizeTo(10, [0, 0, 0, 0, 0]), [2, 2, 2, 2, 2]);
});

Deno.test('normalizeTo: 음수 가중치는 0으로 본다', () => {
  const out = normalizeTo(1000, [-5, 5]);
  assertEquals(out, [0, 1000]);
});

Deno.test('normalizeTo: 대상 금액이 0 이하면 전부 0이다', () => {
  assertEquals(normalizeTo(0, [1, 2]), [0, 0]);
});

Deno.test('ratiosFrom: 지출이 없으면 기본 비율을 쓴다', () => {
  const r = ratiosFrom({});
  assertEquals(r.length, BUDGET_CATEGORIES.length);
  assertEquals(
    r.every((x) => x > 0),
    true,
  );
});

Deno.test('alloc: 모델 비율을 받아 전체 예산에 정확히 맞춘다', async () => {
  const { deps } = fake([reply({ ratios: { food: 38, transport: 8, shopping: 30, sightseeing: 20, other: 4 } })]);
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'alloc', total_krw: 480_000, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  const data = res.data as { alloc: Record<string, number>; source: string };
  assertEquals(sum(data.alloc), 480_000);
  assertEquals(data.alloc.food, 182_400);
  assertEquals(data.source, 'ai');
});

Deno.test('alloc: 모델 응답이 깨지면 지출 비율로 대체한다', async () => {
  const { deps } = fake([reply('<<not json>>'), reply('<<not json>>')]);
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'alloc', total_krw: 480_000, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  const data = res.data as { alloc: Record<string, number>; source: string };
  assertEquals(sum(data.alloc), 480_000);
  assertEquals(data.source, 'fallback');
});

Deno.test('alloc: 모델이 숙소를 끼워 넣어도 무시한다', async () => {
  const { deps } = fake([reply({ ratios: { food: 50, lodging: 50 } })]);
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'alloc', total_krw: 1000, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  const data = res.data as { alloc: Record<string, number> };
  assertEquals(Object.keys(data.alloc).sort(), [...BUDGET_CATEGORIES].sort());
  assertEquals(sum(data.alloc), 1000);
});

Deno.test('plans: 각 안의 하루 합계가 per와 같다', async () => {
  const { deps } = fake([
    reply({
      plans: [
        { id: 'keep_shopping', title: '쇼핑 지키기', desc: 'ㄱ', ratios: { food: 20, transport: 10, shopping: 50, sightseeing: 15, other: 5 } },
        { id: 'keep_food', title: '식비 지키기', desc: 'ㄴ', ratios: { food: 50, transport: 10, shopping: 20, sightseeing: 15, other: 5 } },
      ],
    }),
  ]);
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'plans', per: 101_500, n: 2, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  const data = res.data as { plans: { id: string; perDay: Record<string, number> }[] };
  assertEquals(data.plans.length, 2);
  for (const p of data.plans) assertEquals(sum(p.perDay), 101_500);
});

Deno.test('plans: 모델이 실패하면 룰 기반 3안으로 대체한다', async () => {
  const { deps } = fake([reply({ plans: [] }), reply({ plans: [] })]);
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'plans', per: 101_500, n: 2, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  const data = res.data as { plans: { id: string; perDay: Record<string, number> }[]; source: string };
  assertEquals(data.source, 'fallback');
  assertEquals(data.plans.length, 3);
  for (const p of data.plans) assertEquals(sum(p.perDay), 101_500);
  assertNotEquals(data.plans[0].perDay.shopping, data.plans[1].perDay.shopping);
});

Deno.test('plans: 안이 3개를 넘으면 3개로 자른다', async () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, title: `안 ${i}`, desc: '', ratios: { food: 100 } }));
  const { deps } = fake([reply({ plans: many })]);
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'plans', per: 1000, n: 1, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  assertEquals((res.data as { plans: unknown[] }).plans.length, 3);
});

Deno.test('잘못된 입력은 400이다', async () => {
  const { deps } = fake([]);
  for (
    const body of [
      null,
      { room_id: 'nope', kind: 'alloc', total_krw: 1000 },
      { room_id: ROOM, kind: 'alloc', total_krw: 0 },
      { room_id: ROOM, kind: 'plans', per: 1000 },
      { room_id: ROOM, kind: 'what' },
    ]
  ) {
    const res = await coachBudget(deps, body);
    assertEquals(res.ok, false);
    if (!res.ok) assertEquals(res.status, 400);
  }
});

Deno.test('쿼터 초과는 그대로 돌려준다', async () => {
  const { deps } = fake([], { consumeQuota: () => Promise.resolve('AI_QUOTA_EXCEEDED') });
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'alloc', total_krw: 1000, spent: {} });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.code, 'AI_QUOTA_EXCEEDED');
    assertEquals(res.status, 429);
  }
});

Deno.test('모델 호출이 터져도 fallback으로 응답한다', async () => {
  const { deps } = fake([], { callClaude: () => Promise.reject(new Error('boom')) });
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'alloc', total_krw: 480_000, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  assertEquals((res.data as { source: string }).source, 'fallback');
});

Deno.test('타임아웃이면 fallback으로 응답한다', async () => {
  const { deps } = fake([], {
    timeoutMs: 5,
    callClaude: (_p, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
  });
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'alloc', total_krw: 480_000, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  assertEquals((res.data as { source: string }).source, 'fallback');
});

Deno.test('금액은 전부 정수다', async () => {
  const { deps } = fake([reply({ ratios: { food: 37, transport: 7, shopping: 29, sightseeing: 19, other: 3 } })]);
  const res = await coachBudget(deps, { room_id: ROOM, kind: 'alloc', total_krw: 333_333, spent: SPENT });
  if (!res.ok) throw new Error(res.code);
  const data = res.data as { alloc: Record<string, number> };
  for (const v of Object.values(data.alloc)) assertEquals(Number.isInteger(v), true);
  assertEquals(sum(data.alloc), 333_333);
});
