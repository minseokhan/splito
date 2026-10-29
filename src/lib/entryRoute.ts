export type EntryState = {
  session: boolean;
  profileLoaded: boolean;
  consentComplete: boolean;
  nicknameSet: boolean;
  pendingInviteToken: string | null;
};

export type EntryRoute =
  | '/(auth)/login'
  | '/(auth)/consent'
  | '/(auth)/profile-setup'
  | { join: string }
  | '/(app)'
  | 'loading';

export function resolveEntryRoute(s: EntryState): EntryRoute {
  if (!s.session) return '/(auth)/login';
  if (!s.profileLoaded) return 'loading';
  if (!s.consentComplete) return '/(auth)/consent';
  if (!s.nicknameSet) return '/(auth)/profile-setup';
  if (s.pendingInviteToken) return { join: s.pendingInviteToken };
  return '/(app)';
}
