import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { INVITE_TOKEN_RE } from '@/lib/invite';
import { savePendingInvite } from '@/services/pendingInvite';

// 초대 링크 진입. 토큰을 보관만 하고 분기(로그인·동의·합류 시트)는 홈(resolveEntryRoute)에 맡긴다.
export default function InviteEntry() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const valid = INVITE_TOKEN_RE.test(token ?? '');

  useEffect(() => {
    if (!valid) return;
    savePendingInvite(token)
      .catch(() => undefined)
      .finally(() => router.replace('/'));
  }, [token, valid]);

  return valid ? null : <Redirect href="/" />;
}
