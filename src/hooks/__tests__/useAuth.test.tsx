import { act, render } from '@testing-library/react-native';

import { AuthProvider } from '@/hooks/useAuth';
import { queryClient } from '@/services/queryClient';

type Listener = (event: string, session: { user: { id: string } } | null) => void;
let emit: Listener = () => undefined;

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Listener) => {
        emit = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  },
}));

const as = (id: string) => ({ user: { id } });

// 같은 기기에서 계정을 바꾸면 이전 사용자의 조회 결과(여행·금액)가 보이면 안 된다.
describe('AuthProvider 사용자 전환', () => {
  beforeEach(() => queryClient.clear());
  // setQueryData가 남긴 gc 타이머(5분)가 jest를 붙잡지 않게 비운다.
  afterAll(() => queryClient.clear());

  it('다른 사용자로 바뀌거나 로그아웃하면 쿼리 캐시를 비운다', async () => {
    await render(<AuthProvider>{null}</AuthProvider>);
    await act(async () => emit('INITIAL_SESSION', as('a')));
    queryClient.setQueryData(['rooms'], ['a의 여행']);

    await act(async () => emit('SIGNED_OUT', null));
    expect(queryClient.getQueryData(['rooms'])).toBeUndefined();

    await act(async () => emit('SIGNED_IN', as('b')));
    queryClient.setQueryData(['rooms'], ['b의 여행']);
    await act(async () => emit('SIGNED_IN', as('c')));
    expect(queryClient.getQueryData(['rooms'])).toBeUndefined();
  });

  it('같은 사용자의 토큰 갱신에는 캐시를 그대로 둔다', async () => {
    await render(<AuthProvider>{null}</AuthProvider>);
    await act(async () => emit('INITIAL_SESSION', as('a')));
    queryClient.setQueryData(['rooms'], ['a의 여행']);

    await act(async () => emit('TOKEN_REFRESHED', as('a')));
    expect(queryClient.getQueryData(['rooms'])).toEqual(['a의 여행']);
  });
});
