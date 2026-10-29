import { resolveEntryRoute } from './entryRoute';

const ready = { session: true, profileLoaded: true, consentComplete: true, nicknameSet: true, pendingInviteToken: null };

describe('resolveEntryRoute', () => {
  it.each([
    ['세션 없음', { ...ready, session: false, profileLoaded: false }, '/(auth)/login'],
    ['세션 없음이 대기 초대보다 우선', { ...ready, session: false, pendingInviteToken: 'tok' }, '/(auth)/login'],
    ['프로필 로딩 중', { ...ready, profileLoaded: false }, 'loading'],
    ['동의 미완', { ...ready, consentComplete: false, nicknameSet: false }, '/(auth)/consent'],
    ['닉네임 빈칸', { ...ready, nicknameSet: false, pendingInviteToken: 'tok' }, '/(auth)/profile-setup'],
    ['대기 초대', { ...ready, pendingInviteToken: 'tok' }, { join: 'tok' }],
    ['그 외', ready, '/(app)'],
  ])('%s', (_, state, expected) => {
    expect(resolveEntryRoute(state)).toEqual(expected);
  });
});
