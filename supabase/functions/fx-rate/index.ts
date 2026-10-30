import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';
import { errorResponse, json } from '../_shared/http.ts';
import { type KeximRow, type RateMap, resolveRate } from './fx.ts';

// 캐시 쓰기 전용 service role 클라이언트(이 함수와 delete-account만 사용).
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

async function readCache(date: string): Promise<RateMap | null> {
  const { data, error } = await admin.from('fx_rates').select('currency, rate').eq('base_date', date);
  if (error || !data?.length) return null;
  return new Map(data.map((r) => [r.currency, Number(r.rate)]));
}

async function writeCache(date: string, map: RateMap): Promise<void> {
  const rows = [...map].map(([currency, rate]) => ({ base_date: date, currency, rate }));
  const { error } = await admin.from('fx_rates').upsert(rows, { onConflict: 'base_date,currency' });
  if (error) throw error;
}

async function fetchDay(date: string): Promise<KeximRow[] | null> {
  const url = 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON' +
    `?authkey=${Deno.env.get('KEXIM_API_KEY')}&searchdate=${date.replaceAll('-', '')}&data=AP01`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    // result 1 = 성공. 2(코드 오류)·3(인증키 오류)·4(한도 초과)는 실패로 본다.
    if (rows.some((r) => r.result !== 1)) return null;
    return rows;
  } catch {
    return null; // SSL·네트워크 실패 → pending
  }
}

Deno.serve(async (req) => {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null);
  const date = body?.date, currency = body?.currency;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) ||
    typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    return errorResponse('INVALID_INPUT', 400);
  }

  return json(await resolveRate({ now: new Date(), readCache, fetchDay, writeCache }, date, currency));
});
