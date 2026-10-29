import { toSystemPath } from '@/lib/invite';

const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? 'splito.vercel.app';

// 외부 진입 URL은 /i/{token}과 /auth/callback만 받고, 나머지는 홈으로 보낸다.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return toSystemPath(path, LINK_DOMAIN);
}
