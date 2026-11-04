import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle } from './handler.ts';

// 로직은 전부 handler.ts에 있다(handler.test.ts). 여기는 배선만 한다.
// QR을 찍은 사람은 계정이 없으므로 verify_jwt = false로 열어 두고, 접근 권한은 토큰으로만 판정한다.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve((req) => handle(req, (name, args) => admin.rpc(name, args)));
