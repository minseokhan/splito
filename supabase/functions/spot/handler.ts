import { errorResponse, json } from '../_shared/http.ts';

// 이 자리 정산의 공개 웹 화면(/s/{token})이 쓰는 로직. DB 접근은 주입받는다(테스트 가능하게).
//
// QR을 찍은 사람은 계정이 없으므로 JWT가 없다. 접근 권한은 **토큰 하나**로만 판정한다 —
// 그래서 토큰 형태가 틀리면 DB까지 가지 않고 끊는다. DB 쪽 RPC 3종은 service_role에만 줬으므로
// 이 함수를 지나지 않고는 아무도 그 데이터에 닿지 못한다.

export type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 12; // room_members.guest_name 제약과 같다

// 정적 웹(Vercel)에서 부른다. 자격증명을 싣지 않으므로 오리진만 열어 준다.
const ALLOW = [
  `https://${Deno.env.get('LINK_DOMAIN') ?? 'splito-trip.vercel.app'}`,
  'http://localhost:3000',
];

function withCors(res: Response, origin: string | null): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', origin && ALLOW.includes(origin) ? origin : ALLOW[0]);
  headers.set('Access-Control-Allow-Headers', 'content-type');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers });
}

// RPC는 실패를 예외가 아니라 {error: CODE}로 돌려준다(공개 화면이라 스택을 흘리면 안 된다).
async function call(rpc: Rpc, name: string, args: Record<string, unknown>): Promise<Response> {
  const { data, error } = await rpc(name, args);
  if (error) return errorResponse('SERVER_ERROR', 500);
  const code = (data as { error?: string } | null)?.error;
  if (code) return errorResponse(code, code === 'SPOT_GONE' ? 404 : 400);
  return json(data);
}

export async function handle(req: Request, rpc: Rpc): Promise<Response> {
  const origin = req.headers.get('Origin');
  const done = (res: Response) => withCors(res, origin);

  if (req.method === 'OPTIONS') return done(new Response(null, { status: 204 }));

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('t') ?? '';
      const member = url.searchParams.get('p');
      if (!TOKEN_RE.test(token)) return done(errorResponse('SPOT_GONE', 404));
      if (member !== null && !UUID_RE.test(member)) return done(errorResponse('INVALID_INPUT', 400));
      return done(await call(rpc, 'spot_public_view', { p_token: token, p_member_id: member }));
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as
        | { action?: string; t?: string; name?: string; p?: string }
        | null;
      const token = body?.t ?? '';
      if (!TOKEN_RE.test(token)) return done(errorResponse('SPOT_GONE', 404));

      if (body?.action === 'join') {
        const name = (body.name ?? '').trim();
        if (!name || name.length > MAX_NAME) return done(errorResponse('INVALID_INPUT', 400));
        return done(await call(rpc, 'spot_join', { p_token: token, p_name: name }));
      }

      if (body?.action === 'report') {
        if (!UUID_RE.test(body.p ?? '')) return done(errorResponse('INVALID_INPUT', 400));
        return done(await call(rpc, 'spot_report', { p_token: token, p_member_id: body.p }));
      }
    }

    return done(errorResponse('NOT_FOUND', 404));
  } catch {
    return done(errorResponse('SERVER_ERROR', 500));
  }
}
