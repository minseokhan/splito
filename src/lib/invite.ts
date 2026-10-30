export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

const PENDING_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

// https://{host}/i/{token}, splito://i/{token}, splito:///i/{token}, /i/{token} (+ 끝 슬래시·쿼리·해시)
const LINK_RE = /^(?:https:\/\/([^/?#]+)\/|splito:\/\/\/?|\/)i\/([^/?#]+)\/?(?:[?#].*)?$/;

export function buildInviteUrl(domain: string, token: string): string {
  return `https://${domain}/i/${token}`;
}

export function extractInviteToken(input: string, domain: string): string | null {
  const text = input.trim();
  if (INVITE_TOKEN_RE.test(text)) return text;
  // 카톡 메시지처럼 앞뒤에 글이 붙어 있어도 공백으로 나눈 단어 중 링크를 찾는다.
  for (const word of text.split(/\s+/)) {
    const m = LINK_RE.exec(word);
    if (!m) continue;
    const [, host, token] = m;
    // 다른 도메인의 /i/... 는 피싱 링크일 수 있어 거부한다.
    if (host !== undefined && host.toLowerCase() !== domain.toLowerCase()) continue;
    if (INVITE_TOKEN_RE.test(token)) return token;
  }
  return null;
}

const CALLBACK_RE = /^(?:splito:\/\/\/?|\/)auth\/callback\/?(?:[?#].*)?$/;

// +native-intent 허용 목록(ARCHITECTURE §4 딥링크): 초대 링크는 /i/{token}으로, 로그인 콜백은 그대로, 나머지는 홈.
export function toSystemPath(path: string, domain: string): string {
  if (CALLBACK_RE.test(path)) return path;
  const m = LINK_RE.exec(path);
  if (m && (m[1] === undefined || m[1].toLowerCase() === domain.toLowerCase()) && INVITE_TOKEN_RE.test(m[2])) {
    return `/i/${m[2]}`;
  }
  return '/';
}

export type PendingInvite = { token: string; savedAt: number };

export function isPendingInviteValid(p: PendingInvite | null, now: number): boolean {
  if (!p || !INVITE_TOKEN_RE.test(p.token)) return false;
  const age = now - p.savedAt;
  return age >= 0 && age < PENDING_INVITE_TTL_MS;
}
