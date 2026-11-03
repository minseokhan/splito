// 알림 payload의 이동 경로. 서버(DB 트리거)가 만든 값이지만 라우터에 넘기기 전에 모양을 확인한다.
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const ALLOWED = [new RegExp(`^/rooms/${UUID}/expenses/${UUID}$`), new RegExp(`^/rooms/${UUID}/settle$`)];

export function notificationPath(data: unknown): string | null {
  const path = (data as { path?: unknown } | null | undefined)?.path;
  if (typeof path !== 'string') return null;
  return ALLOWED.some((re) => re.test(path)) ? path : null;
}
