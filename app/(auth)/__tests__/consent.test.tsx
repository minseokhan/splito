import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { updateConsent, updateNickname } from '@/services/auth';

import Consent from '../consent';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/services/auth', () => ({ updateConsent: jest.fn(), updateNickname: jest.fn(), signOut: jest.fn() }));
const mockRefresh = jest.fn();
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { nickname: '민지' }, refreshProfile: mockRefresh }) }));

const cta = () => screen.getByRole('button', { name: '시작하기' });
const check = (name: string) => fireEvent.press(screen.getByRole('checkbox', { name }));

describe('가입 · 약관 화면', () => {
  it('SNS 닉네임으로 미리 채우고 글자수를 보여준다', async () => {
    await render(<Consent />);
    expect(screen.getByLabelText('닉네임').props.value).toBe('민지');
    expect(screen.getByText('2/12')).toBeOnTheScreen();
  });

  it('필수 3개를 체크하기 전에는 CTA가 비활성이다', async () => {
    await render(<Consent />);
    await check('서비스 이용약관(필수)');
    await check('만 14세 이상이에요(필수)');
    await check('마케팅 정보 수신(선택)');
    await waitFor(() => expect(cta()).toBeDisabled());
  });

  it('필수 3개를 체크하면 CTA가 활성화된다', async () => {
    await render(<Consent />);
    await check('서비스 이용약관(필수)');
    await check('만 14세 이상이에요(필수)');
    await check('개인정보 국외 이전 고지 확인(필수)');
    await waitFor(() => expect(cta()).toBeEnabled());
  });

  it('닉네임이 비면 CTA가 비활성이다', async () => {
    await render(<Consent />);
    await check('전체 동의하기');
    await fireEvent.changeText(screen.getByLabelText('닉네임'), '');
    await waitFor(() => expect(cta()).toBeDisabled());
  });

  it('전체 동의 후 시작하면 동의·닉네임을 저장하고 진입 라우트로 보낸다', async () => {
    await render(<Consent />);
    await check('전체 동의하기');
    await fireEvent.changeText(screen.getByLabelText('닉네임'), '지훈');
    await waitFor(() => expect(cta()).toBeEnabled());
    await fireEvent.press(cta());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(updateConsent).toHaveBeenCalledWith({ terms: true, age14: true, overseas: true, marketing: true });
    expect(updateNickname).toHaveBeenCalledWith('지훈');
    expect(mockRefresh).toHaveBeenCalled();
  });
});
