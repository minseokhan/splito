import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { resolveEntryRoute } from '@/lib/entryRoute';
import { isConsentComplete } from '@/lib/profile';
import { loadPendingInvite } from '@/services/pendingInvite';

export default function Index() {
  const { session, profile } = useAuth();
  const [pendingToken, setPendingToken] = useState<string | null>();

  useEffect(() => {
    loadPendingInvite()
      .catch(() => null)
      .then((p) => setPendingToken(p?.token ?? null));
  }, []);

  if (session === undefined || pendingToken === undefined) return null; // 세션·대기 초대 복원 중
  const route = resolveEntryRoute({
    session: session !== null,
    profileLoaded: profile !== undefined,
    consentComplete: !!profile && isConsentComplete(profile),
    nicknameSet: !!profile?.nickname,
    pendingInviteToken: pendingToken,
  });
  if (route === 'loading') return null;
  if (typeof route === 'string') return <Redirect href={route} />;
  return <Redirect href={{ pathname: '/join/[token]', params: { token: route.join } }} />;
}
