import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { buildConsentUpdate, consentSchema, nicknameSchema, type ConsentInput } from '@/lib/profile';

import { supabase } from './supabase';

const REDIRECT_TO = 'splito://auth/callback';

// 로그인 진행 중(대기 중인 PKCE verifier가 있음)일 때만 콜백 코드를 교환한다(ARCHITECTURE §6.1).
let loginInProgress = false;

export function isLoginInProgress(): boolean {
  return loginInProgress;
}

// signInWithProvider와 app/auth/callback 라우트가 함께 쓴다. 먼저 호출한 쪽만 교환한다.
export async function completeSignIn(url: string): Promise<void> {
  if (!loginInProgress) return;
  loginInProgress = false;
  const { code } = Linking.parse(url).queryParams ?? {};
  if (typeof code !== 'string') throw new Error('LOGIN_CANCELLED');
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

// 네이버는 Supabase 커스텀 OIDC 제공자(대시보드에서 등록, config.toml 미지원)다(ADR-005).
export async function signInWithProvider(provider: 'kakao' | 'custom:naver'): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
  });
  if (error) throw error;
  loginInProgress = true;
  try {
    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_TO);
    if (result.type !== 'success') throw new Error('LOGIN_CANCELLED');
    await completeSignIn(result.url);
  } finally {
    loginInProgress = false;
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function myId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('AUTH_EXPIRED');
  return id;
}

export async function updateConsent(input: ConsentInput): Promise<void> {
  const update = buildConsentUpdate(consentSchema.parse(input), new Date());
  const { error } = await supabase.from('profiles').update(update).eq('id', await myId());
  if (error) throw error;
}

export async function updateNickname(nickname: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ nickname: nicknameSchema.parse(nickname) })
    .eq('id', await myId());
  if (error) throw error;
}

// 내 정보의 마케팅 수신 토글. 필수 동의 시각은 건드리지 않는다.
export async function updateMarketing(optIn: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ marketing_opt_in: optIn, marketing_opt_in_at: optIn ? new Date().toISOString() : null })
    .eq('id', await myId());
  if (error) throw error;
}
