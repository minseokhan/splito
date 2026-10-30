import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ExpenseDraft } from '@/lib/expenseForm';
import { api } from '@/services/api';
import { loadDraft } from '@/services/drafts';

import Review from '../review';

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ roomId: 'r1' }) }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('@/services/storage', () => ({ copyReceipt: jest.fn() }));
jest.mock('@/services/drafts', () => ({ loadDraft: jest.fn(), saveDraft: jest.fn(), clearDraft: jest.fn() }));
jest.mock('@/services/api', () => ({
  api: {
    roomMembers: jest.fn(),
    fxRate: jest.fn(),
    recentExpenses: jest.fn(),
    saveExpense: jest.fn(),
    expensePayload: jest.fn(),
  },
}));

const member = (id: string, name: string) => ({
  id, kind: 'user', userId: id === 'm1' ? 'u1' : 'u2', name, avatarUrl: null,
  representativeMemberId: null, joinedAt: '2026-10-20T00:00:00Z', leftAt: null,
});

function draft(over: Partial<ExpenseDraft> = {}): ExpenseDraft {
  const item = (id: string, position: number, nameKo: string, amountOriginal: number) => ({
    id, position, nameOriginal: '', nameKo, quantity: 1, amountOriginal, needsReview: false, isAdjustment: false, assigneeMemberIds: [],
  });
  return {
    id: 'e1', roomId: 'r1', source: 'manual', payerKind: 'member', payerMemberId: 'm1', merchant: '이치란',
    paidLocalDate: '2026-10-21', paidLocalTime: null, currency: 'JPY', krwCharged: null, cardLast4: null,
    scopeMemberIds: ['m1', 'm2'], items: [item('i1', 0, '라멘', 2000), item('i2', 1, '맥주', 1280)],
    photos: [], needsReview: false, aiResult: null, ...over,
  };
}

async function renderWith(d: ExpenseDraft) {
  jest.mocked(loadDraft).mockResolvedValue({ draft: d, localPhotos: [] });
  jest.mocked(api.roomMembers).mockResolvedValue([member('m1', '민지'), member('m2', '지훈')] as never);
  jest.mocked(api.fxRate).mockResolvedValue({ base_date: '2026-10-21', rate: 9.1234, source: 'kexim' });
  jest.mocked(api.recentExpenses).mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <Review />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('확인·수정 화면', () => {
  it('박스 원본 합계와 원화 미리보기 합계를 보여준다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('합계 ¥3,280')).toBeOnTheScreen();
    expect(await screen.findByText('약 29,925원')).toBeOnTheScreen();
    expect(screen.getByText('미리보기 — 저장 시 확정돼요')).toBeOnTheScreen();
  });

  it('대상 인원이 0명이면 저장하지 않고 문구를 보여준다', async () => {
    await renderWith(draft({ scopeMemberIds: [] }));
    await fireEvent.press(await screen.findByRole('button', { name: '저장' }));
    expect(await screen.findByText('나눌 사람을 1명 이상 골라주세요')).toBeOnTheScreen();
    expect(api.saveExpense).not.toHaveBeenCalled();
  });
});
