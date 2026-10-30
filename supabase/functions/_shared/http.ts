export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// 로그에는 code·room_id만 남긴다(요청 본문·AI 원문·키 금지).
export function errorResponse(code: string, status: number, roomId?: string): Response {
  console.error(JSON.stringify({ code, room_id: roomId ?? null }));
  return json({ error: { code } }, status);
}
