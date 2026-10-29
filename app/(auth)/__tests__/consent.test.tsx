import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Consent from '../consent';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/services/auth', () => ({ updateConsent: jest.fn(), signOut: jest.fn() }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ refreshProfile: jest.fn() }) }));

const cta = () => screen.getByRole('button', { name: '동의하고 계속하기' });

describe('동의 화면', () => {
  it('필수 3개를 체크하기 전에는 CTA가 비활성이다', async () => {
    await render(<Consent />);
    await fireEvent.press(screen.getByRole('checkbox', { name: '서비스 이용약관 동의(필수)' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '만 14세 이상이에요(필수)' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '마케팅 정보 수신 동의(선택)' }));
    await waitFor(() => expect(cta()).toBeDisabled());
    expect(screen.getByText('필수 항목에 모두 동의해야 시작할 수 있어요')).toBeOnTheScreen();
  });

  it('필수 3개를 체크하면 CTA가 활성화된다', async () => {
    await render(<Consent />);
    await fireEvent.press(screen.getByRole('checkbox', { name: '서비스 이용약관 동의(필수)' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '만 14세 이상이에요(필수)' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '개인정보 국외 이전 고지를 확인했어요(필수)' }));
    await waitFor(() => expect(cta()).toBeEnabled());
  });

  it('필수 전체 동의 하나로 필수 3개가 체크된다', async () => {
    await render(<Consent />);
    await fireEvent.press(screen.getByRole('checkbox', { name: '필수 전체 동의' }));
    await waitFor(() => expect(cta()).toBeEnabled());
  });
});
