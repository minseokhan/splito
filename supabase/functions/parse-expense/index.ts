import Anthropic from 'npm:@anthropic-ai/sdk';
import { requireUser } from '../_shared/auth.ts';
import { errorResponse, json } from '../_shared/http.ts';
import { parseExpense } from './parse.ts';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

Deno.serve(async (req) => {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { client } = auth; // 사용자 JWT 클라이언트: RPC·Storage 모두 RLS가 적용된다

  const body = await req.json().catch(() => null);
  const result = await parseExpense({
    now: new Date(),
    model: Deno.env.get('CLAUDE_MODEL')!,
    consumeQuota: async (roomId) => {
      const { error } = await client.rpc('consume_ai_quota', {
        p_room_id: roomId,
        p_global_limit: Number(Deno.env.get('AI_DAILY_GLOBAL_LIMIT') ?? '0'), // 미설정이면 0 = 차단(비용 안전)
      });
      if (!error) return null;
      return error.message === 'AI_QUOTA_EXCEEDED' || error.message === 'FORBIDDEN' ? error.message : 'PARSE_FAILED';
    },
    download: async (path) => {
      const { data, error } = await client.storage.from('receipts').download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    callClaude: async (params, signal) => {
      const msg = await anthropic.messages.create(params, { signal, maxRetries: 0 });
      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return { stop_reason: msg.stop_reason, text };
    },
  }, body);

  return result.ok ? json(result.data) : errorResponse(result.code, result.status, result.room_id);
});
