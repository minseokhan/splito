import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { deleteAccount } from '@/services/auth';

import Settings from '../settings';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0' }));
jest.mock('@/services/auth', () => ({
  deleteAccount: jest.fn(),
  signOut: jest.fn(),
  updateMarketing: jest.fn(),
  updateNickname: jest.fn(),
  updatePushEnabled: jest.fn(),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { app_metadata: { provider: 'kakao' } } }, profile: { nickname: '민지' }, refreshProfile: jest.fn() }),
}));
jest.mock('@/hooks/usePayoutAccount', () => ({ useMyPayoutAccount: () => ({ data: null }) }));
let mockRooms: unknown[] = [];
jest.mock('@/hooks/useRooms', () => ({ useMyRooms: () => ({ data: mockRooms }) }));
const mockToast = jest.fn();
jest.mock('@/components/Toast', () => ({ useToast: () => mockToast }));

const room = (name: string, myNet: number) => ({ roomId: name, name, status: 'shared', myNet });
const submit = () => screen.getByRole('button', { name: '탈퇴하기' });

describe('내 정보 · 회원 탈퇴', () => {
  beforeEach(() => {
    mockRooms = [];
    jest.clearAllMocks();
  });

  it('[회원 탈퇴] → 확인 시트. 확인 체크 전에는 [탈퇴하기]가 꺼져 있다', async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: '회원 탈퇴' }));
    expect(screen.getByText('정말 탈퇴할까요?')).toBeOnTheScreen();
    expect(submit()).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: '위 내용을 확인했어요' }));
    expect(submit()).toBeEnabled();
  });

  it('정산이 남은 여행이 있으면 노란 안내에 여행명·금액을 보여준다(그래도 탈퇴할 수 있다)', async () => {
    mockRooms = [room('오사카·교토', -244920), room('제주', 0)];
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: '회원 탈퇴' }));
    expect(screen.getByText('정산이 남은 여행이 있어요')).toBeOnTheScreen();
    expect(screen.getByText(/오사카·교토 · 보낼 돈 244,920원/)).toBeOnTheScreen();
    expect(screen.queryByText(/제주/)).toBeNull();
  });

  it('정산이 남은 여행이 없으면 노란 안내가 없다', async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: '회원 탈퇴' }));
    expect(screen.queryByText('정산이 남은 여행이 있어요')).toBeNull();
  });

  it('탈퇴하면 로그인 화면으로 보내고 토스트를 띄운다', async () => {
    jest.mocked(deleteAccount).mockResolvedValueOnce();
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: '회원 탈퇴' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '위 내용을 확인했어요' }));
    await fireEvent.press(submit());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/login'));
    expect(deleteAccount).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('탈퇴했어요. 그동안 이용해 주셔서 고마워요');
  });
});
