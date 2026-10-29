import { Redirect } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { resolveEntryRoute } from '@/lib/entryRoute';
import { isConsentComplete } from '@/lib/profile';

export default function Index() {
  const { session, profile } = useAuth();
  if (session === undefined) return null; // 저장된 세션 복원 중
  const route = resolveEntryRoute({
    session: session !== null,
    profileLoaded: profile !== undefined,
    consentComplete: !!profile && isConsentComplete(profile),
    nicknameSet: !!profile?.nickname,
    pendingInviteToken: null,
  });
  if (route === 'loading') return null;
  // TODO(3-rooms): { join } 분기는 합류 확인 시트로 보낸다. 지금은 /(app).
  return <Redirect href={typeof route === 'string' ? route : '/(app)'} />;
}
