// Expo Push API 호출과 응답 해석. DB 트리거가 보낸 토큰 묶음을 그대로 전달한다.
// 문구·대상·딥링크는 DB가 이미 정했다. 여기서 다시 만들지 않는다.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100; // Expo 권장 상한

export type PushInput = { tokens: string[]; title: string; body: string; path: string };
type Ticket = { status: string; details?: { error?: string } };

export function chunk<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// 영구 실패 토큰만 골라낸다. 일시 실패(MessageRateExceeded 등)는 지우지 않는다.
export function deadTokens(tokens: string[], tickets: Ticket[]): string[] {
  return tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
}

export async function sendChunk(input: PushInput, tokens: string[]): Promise<Ticket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: input.title,
        body: input.body,
        data: { path: input.path },
        sound: 'default',
        channelId: 'default',
        priority: 'high',
      })),
    ),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`expo ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}
