import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { queryClient } from '@/services/queryClient';
import { supabase } from '@/services/supabase';
import type { Tables } from '@/types/database';

type Profile = Tables<'profiles'>;

type AuthValue = {
  session: Session | null | undefined; // undefined = 저장된 세션 복원 중
  profile: Profile | null | undefined; // undefined = 아직 조회 전
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // 조회한 프로필을 userId와 함께 보관해, 사용자가 바뀌면 바로 "조회 전"으로 보이게 한다.
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null }>();
  const userId = session?.user.id;
  const profile = !userId ? (session === undefined ? undefined : null) : loaded?.userId === userId ? loaded.profile : undefined;

  useEffect(() => {
    // INITIAL_SESSION 이벤트로 저장된 세션도 전달된다.
    // 사용자가 바뀌면(로그아웃·다른 계정 로그인) 쿼리 캐시를 비운다 — 안 비우면 이전 사용자의 여행·금액이 보인다.
    let prevUserId: string | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const id = next?.user.id;
      if (prevUserId && prevUserId !== id) queryClient.clear();
      prevUserId = id;
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (userId) setLoaded({ userId, profile: await fetchProfile(userId) });
  }, [fetchProfile, userId]);

  useEffect(() => {
    if (!userId) return;
    fetchProfile(userId)
      .catch(() => null)
      .then((p) => setLoaded({ userId, profile: p }));
  }, [fetchProfile, userId]);

  return <AuthContext.Provider value={{ session, profile, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
