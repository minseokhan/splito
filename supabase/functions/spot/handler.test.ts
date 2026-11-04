import { assertEquals } from 'jsr:@std/assert@1';
import { handle, type Rpc } from './handler.ts';

const TOKEN = 'abcdefghij0123456789_-';
const MEMBER = '0d44eddf-6f1a-4929-ac04-2cb3f9651873';
const ORIGIN = 'https://splito-trip.vercel.app';

// 호출된 RPC를 기록하는 가짜. 실제 DB 호출은 이 파일의 관심사가 아니다.
function fake(result: unknown = { ok: true }): { rpc: Rpc; calls: [string, Record<string, unknown>][] } {
  const calls: [string, Record<string, unknown>][] = [];
  return {
    calls,
    rpc: (name, args) => {
      calls.push([name, args]);
      return Promise.resolve({ data: result, error: null });
    },
  };
}

const get = (q: string) => new Request(`https://x/spot${q}`, { headers: { Origin: ORIGIN } });
const post = (body: unknown) =>
  new Request('https://x/spot', { method: 'POST', headers: { Origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) });

Deno.test('OPTIONS는 CORS 헤더만 돌려준다', async () => {
  const res = await handle(new Request('https://x/spot', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), fake().rpc);
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

Deno.test('허용하지 않은 오리진에는 우리 도메인을 돌려준다', async () => {
  const req = new Request('https://x/spot', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  const res = await handle(req, fake().rpc);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

Deno.test('GET은 토큰으로 공개 화면을 읽는다', async () => {
  const f = fake({ people: 4 });
  const res = await handle(get(`?t=${TOKEN}`), f.rpc);
  assertEquals(res.status, 200);
  assertEquals(f.calls, [['spot_public_view', { p_token: TOKEN, p_member_id: null }]]);
  assertEquals(await res.json(), { people: 4 });
});

Deno.test('참여자 id를 주면 그대로 넘긴다(계좌 공개 판정은 DB가 한다)', async () => {
  const f = fake();
  await handle(get(`?t=${TOKEN}&p=${MEMBER}`), f.rpc);
  assertEquals(f.calls[0][1], { p_token: TOKEN, p_member_id: MEMBER });
});

// 토큰이 이 기능의 유일한 접근 권한이다. 형태가 틀리면 DB까지 가지 않는다.
Deno.test('토큰 형태가 틀리면 DB를 부르지 않고 404', async () => {
  for (const bad of ['', 'short', `${TOKEN}x`, "' or 1=1--"]) {
    const f = fake();
    const res = await handle(get(`?t=${encodeURIComponent(bad)}`), f.rpc);
    assertEquals(res.status, 404, `토큰 ${bad}`);
    assertEquals(f.calls.length, 0);
  }
});

Deno.test('참여자 id가 uuid가 아니면 400', async () => {
  const f = fake();
  const res = await handle(get(`?t=${TOKEN}&p=notauuid`), f.rpc);
  assertEquals(res.status, 400);
  assertEquals(f.calls.length, 0);
});

Deno.test('RPC가 error를 담아 오면 그 코드로 내려준다', async () => {
  const res = await handle(get(`?t=${TOKEN}`), fake({ error: 'SPOT_GONE' }).rpc);
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: { code: 'SPOT_GONE' } });
});

Deno.test('join은 이름을 다듬어 넘긴다', async () => {
  const f = fake({ member_id: MEMBER });
  const res = await handle(post({ action: 'join', t: TOKEN, name: '  김하늘  ' }), f.rpc);
  assertEquals(res.status, 200);
  assertEquals(f.calls, [['spot_join', { p_token: TOKEN, p_name: '김하늘' }]]);
});

Deno.test('이름이 비었거나 12자를 넘으면 400', async () => {
  for (const name of ['', '   ', 'ㄱ'.repeat(13)]) {
    const f = fake();
    assertEquals((await handle(post({ action: 'join', t: TOKEN, name }), f.rpc)).status, 400);
    assertEquals(f.calls.length, 0);
  }
});

Deno.test('report는 참여자 id가 있어야 한다', async () => {
  const f = fake();
  assertEquals((await handle(post({ action: 'report', t: TOKEN }), f.rpc)).status, 400);
  assertEquals(f.calls.length, 0);

  const g = fake();
  assertEquals((await handle(post({ action: 'report', t: TOKEN, p: MEMBER }), g.rpc)).status, 200);
  assertEquals(g.calls, [['spot_report', { p_token: TOKEN, p_member_id: MEMBER }]]);
});

Deno.test('모르는 action은 404', async () => {
  assertEquals((await handle(post({ action: 'delete', t: TOKEN }), fake().rpc)).status, 404);
});

Deno.test('본문이 JSON이 아니어도 죽지 않는다', async () => {
  const req = new Request('https://x/spot', { method: 'POST', headers: { Origin: ORIGIN }, body: '깨진본문' });
  assertEquals((await handle(req, fake().rpc)).status, 404);
});

Deno.test('RPC가 터지면 500으로 접고 내부 내용을 흘리지 않는다', async () => {
  const rpc: Rpc = () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } });
  const res = await handle(get(`?t=${TOKEN}`), rpc);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: { code: 'SERVER_ERROR' } });
});

Deno.test('모든 응답에 CORS 헤더가 붙는다', async () => {
  for (const res of [await handle(get(`?t=${TOKEN}`), fake().rpc), await handle(get('?t=bad'), fake().rpc)]) {
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  }
});
