import { createClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, json } from '../_shared/http.ts';
import { chunk, deadTokens, sendChunk, type PushInput } from './send.ts';

// 호출자는 DB 트리거(pg_net)뿐이다. JWT가 아니라 Vault에 둔 공유 시크릿으로 인증한다
// (config.toml에서 verify_jwt = false).
const SECRET = Deno.env.get('PUSH_SECRET');

// 죽은 토큰 삭제 전용 service role 클라이언트.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function isPushInput(b: unknown): b is PushInput {
  const x = b as PushInput | null;
  return !!x && Array.isArray(x.tokens) && x.tokens.every((t) => typeof t === 'string') &&
    typeof x.title === 'string' && typeof x.body === 'string' && typeof x.path === 'string';
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-push-secret') !== SECRET) return errorResponse('FORBIDDEN', 403);

  const input = await req.json().catch(() => null);
  if (!isPushInput(input) || input.tokens.length === 0) return errorResponse('INVALID_INPUT', 400);

  const dead: string[] = [];
  for (const tokens of chunk(input.tokens)) {
    try {
      dead.push(...deadTokens(tokens, await sendChunk(input, tokens)));
    } catch (e) {
      // 한 묶음이 실패해도 나머지는 보낸다. 본문·토큰은 로그에 남기지 않는다.
      console.error(JSON.stringify({ code: 'EXPO_SEND_FAILED', message: String(e) }));
    }
  }
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);

  return json({ sent: input.tokens.length - dead.length, removed: dead.length });
});
