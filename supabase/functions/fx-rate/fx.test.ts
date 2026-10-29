import { assertEquals } from 'jsr:@std/assert@1';
import { type KeximRow, kstToday, normalizeKeximRows, resolveRate } from './fx.ts';

const row = (cur_unit: string, deal_bas_r: string): KeximRow => ({ result: 1, cur_unit, deal_bas_r });
const DAY: KeximRow[] = [row('USD', '1,328.5'), row('JPY(100)', '912.34'), row('IDR(100)', '8.61'), row('CNH', '190.12')];

// 날짜 → API 응답. 없는 날짜는 빈 배열(휴일·고시 전), null이면 네트워크 실패.
function fakeDeps(now: string, api: Record<string, KeximRow[] | null>, cache = new Map<string, Map<string, number>>()) {
  const fetched: string[] = [];
  return {
    fetched,
    cache,
    deps: {
      now: new Date(now),
      readCache: (d: string) => Promise.resolve(cache.get(d) ?? null),
      fetchDay: (d: string) => {
        fetched.push(d);
        return Promise.resolve(d in api ? api[d] : []);
      },
      writeCache: (d: string, m: Map<string, number>) => {
        cache.set(d, m);
        return Promise.resolve();
      },
    },
  };
}

// 2026-10-30(금) 15:00 KST
const NOW = '2026-10-30T06:00:00Z';

Deno.test('normalize: JPY(100)·IDR(100)는 /100, 쉼표 파싱, CNH는 CNY 키', () => {
  const m = normalizeKeximRows(DAY);
  assertEquals(m.get('USD'), 1328.5);
  assertEquals(m.get('JPY'), 9.1234);
  assertEquals(m.get('IDR'), 0.0861);
  assertEquals(m.get('CNY'), 190.12);
  assertEquals(m.has('CNH'), false);
});

Deno.test('kstToday: UTC 15시 이후는 KST 다음 날', () => {
  assertEquals(kstToday(new Date('2026-10-30T14:59:00Z')), '2026-10-30');
  assertEquals(kstToday(new Date('2026-10-30T15:00:00Z')), '2026-10-31');
});

Deno.test('KRW는 조회 없이 rate 1', async () => {
  const f = fakeDeps(NOW, {});
  assertEquals(await resolveRate(f.deps, '2026-10-30', 'KRW'), { base_date: '2026-10-30', rate: 1, source: 'krw' });
  assertEquals(f.fetched, []);
});

Deno.test('고시일 그대로 + CNY는 CNH 값', async () => {
  const f = fakeDeps(NOW, { '2026-10-29': DAY });
  assertEquals(await resolveRate(f.deps, '2026-10-29', 'CNY'), { base_date: '2026-10-29', rate: 190.12, source: 'kexim' });
  assertEquals(await resolveRate(f.deps, '2026-10-29', 'JPY'), { base_date: '2026-10-29', rate: 9.1234, source: 'kexim' });
});

Deno.test('주말·연휴는 직전 고시일로 거슬러 찾는다', async () => {
  const f = fakeDeps(NOW, { '2026-10-23': DAY });
  assertEquals(await resolveRate(f.deps, '2026-10-26', 'USD'), { base_date: '2026-10-23', rate: 1328.5, source: 'kexim' });
  assertEquals(f.fetched, ['2026-10-26', '2026-10-25', '2026-10-24', '2026-10-23']);
});

Deno.test('10일 전(date-10)까지 찾고 11일째는 pending', async () => {
  assertEquals(
    (await resolveRate(fakeDeps(NOW, { '2026-10-10': DAY }).deps, '2026-10-20', 'USD')),
    { base_date: '2026-10-10', rate: 1328.5, source: 'kexim' },
  );
  const f = fakeDeps(NOW, { '2026-10-09': DAY });
  assertEquals(await resolveRate(f.deps, '2026-10-20', 'USD'), { status: 'pending' });
  assertEquals(f.fetched.length, 11);
});

Deno.test('오늘 고시 전이고 이전도 없으면 pending', async () => {
  assertEquals(await resolveRate(fakeDeps(NOW, {}).deps, '2026-10-30', 'USD'), { status: 'pending' });
});

Deno.test('KST 오늘보다 뒤 날짜는 pending(조회 안 함)', async () => {
  const f = fakeDeps(NOW, { '2026-10-31': DAY });
  assertEquals(await resolveRate(f.deps, '2026-10-31', 'USD'), { status: 'pending' });
  assertEquals(f.fetched, []);
});

Deno.test('fetch 실패(null)·예외는 pending', async () => {
  assertEquals(await resolveRate(fakeDeps(NOW, { '2026-10-29': null }).deps, '2026-10-29', 'USD'), { status: 'pending' });
  const f = fakeDeps(NOW, {});
  f.deps.fetchDay = () => Promise.reject(new Error('ssl'));
  assertEquals(await resolveRate(f.deps, '2026-10-29', 'USD'), { status: 'pending' });
});

Deno.test('고시일 데이터에 없는 통화는 unsupported', async () => {
  assertEquals(await resolveRate(fakeDeps(NOW, { '2026-10-29': DAY }).deps, '2026-10-29', 'VND'), { status: 'unsupported' });
});

Deno.test('같은 날 두 번째 요청은 캐시로 fetch 0회', async () => {
  const f = fakeDeps(NOW, { '2026-10-29': DAY });
  await resolveRate(f.deps, '2026-10-29', 'USD');
  f.fetched.length = 0;
  assertEquals(await resolveRate(f.deps, '2026-10-29', 'JPY'), { base_date: '2026-10-29', rate: 9.1234, source: 'kexim' });
  assertEquals(f.fetched, []);
});
