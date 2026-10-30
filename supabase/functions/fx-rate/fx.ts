// 수출입은행 환율 조회·정규화·하루 단위 캐시. 원화 금액 계산은 하지 않는다(save_expense가 한다).

export type KeximRow = { result?: number; cur_unit: string; deal_bas_r: string };
export type RateMap = Map<string, number>;
export type RateResult =
  | { base_date: string; rate: number; source: 'kexim' }
  | { base_date: string; rate: 1; source: 'krw' }
  | { status: 'pending' | 'unsupported' };

export type Deps = {
  now: Date;
  readCache(date: string): Promise<RateMap | null>;
  fetchDay(date: string): Promise<KeximRow[] | null>; // null = 네트워크·SSL·API 실패, [] = 고시 없음
  writeCache(date: string, map: RateMap): Promise<void>;
};

const LOOKBACK_DAYS = 10; // save_expense._lookup_fx와 같은 범위: date-10 ~ date

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function normalizeKeximRows(rows: KeximRow[]): RateMap {
  const map: RateMap = new Map();
  for (const r of rows) {
    const per100 = r.cur_unit.endsWith('(100)');
    let code = r.cur_unit.replace('(100)', '').trim();
    if (code === 'CNH') code = 'CNY';
    const rate = Number(r.deal_bas_r.replaceAll(',', ''));
    if (!/^[A-Z]{3}$/.test(code) || !(rate > 0)) continue;
    map.set(code, round6(per100 ? rate / 100 : rate));
  }
  return map;
}

export function kstToday(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

function minusDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function resolveRate(deps: Deps, date: string, currency: string): Promise<RateResult> {
  if (currency === 'KRW') return { base_date: date, rate: 1, source: 'krw' };
  if (date > kstToday(deps.now)) return { status: 'pending' };
  try {
    for (let i = 0; i <= LOOKBACK_DAYS; i++) {
      const day = minusDays(date, i);
      let map = await deps.readCache(day);
      if (!map) {
        const rows = await deps.fetchDay(day);
        if (rows === null) return { status: 'pending' };
        if (rows.length === 0) continue; // 휴일·고시 전
        map = normalizeKeximRows(rows);
        await deps.writeCache(day, map);
      }
      const rate = map.get(currency);
      return rate === undefined ? { status: 'unsupported' } : { base_date: day, rate, source: 'kexim' };
    }
  } catch {
    return { status: 'pending' };
  }
  return { status: 'pending' };
}
