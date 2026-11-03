import Anthropic from 'npm:@anthropic-ai/sdk';
import { requireUser } from '../_shared/auth.ts';
import { errorResponse, json } from '../_shared/http.ts';
import { coachBudget } from './coach.ts';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

Deno.serve(async (req) => {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { client } = auth; // 사용자 JWT 클라이언트: 방 참여 여부는 consume_ai_quota가 본다

  const body = await req.json().catch(() => null);
  const result = await coachBudget({
    model: Deno.env.get('CLAUDE_MODEL')!,
    consumeQuota: async (roomId) => {
      const { error } = await client.rpc('consume_ai_quota', {
        p_room_id: roomId,
        p_global_limit: Number(Deno.env.get('AI_DAILY_GLOBAL_LIMIT') ?? '0'), // 미설정이면 0 = 차단(비용 안전)
      });
      if (!error) return null;
      return error.message === 'AI_QUOTA_EXCEEDED' || error.message === 'FORBIDDEN' ? error.message : 'COACH_FAILED';
    },
    callClaude: async (params, signal) => {
      const msg = await anthropic.messages.create(params, { signal, maxRetries: 0 });
      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return { stop_reason: msg.stop_reason, text };
    },
  }, body);

  return result.ok ? json(result.data) : errorResponse(result.code, result.status, result.room_id);
});
