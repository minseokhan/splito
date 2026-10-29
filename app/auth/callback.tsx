import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';

import { completeSignIn, isLoginInProgress } from '@/services/auth';

// OAuth 리다이렉트. 로그인이 진행 중일 때만 code를 교환하고, 아니면 홈으로 보낸다(ARCHITECTURE §6.1).
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const pending = isLoginInProgress();

  useEffect(() => {
    if (!pending || !url) return;
    // 실패는 로그인 화면(signInWithProvider 호출 쪽)이 보여준다.
    completeSignIn(url)
      .catch(() => undefined)
      .finally(() => router.replace('/'));
  }, [pending, url]);

  return pending ? null : <Redirect href="/" />;
}
