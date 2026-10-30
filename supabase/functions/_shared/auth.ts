import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { errorResponse } from './http.ts';

// 요청 JWT로 사용자 클라이언트를 만들고 검증한다. 실패하면 401 Response를 돌려준다.
export async function requireUser(req: Request): Promise<{ client: SupabaseClient; user: User } | Response> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return errorResponse('AUTH_EXPIRED', 401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return errorResponse('AUTH_EXPIRED', 401);
  return { client, user: data.user };
}
