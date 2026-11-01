import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toSavePayload, type ExpenseDraft } from '@/lib/expenseForm';
import { api } from '@/services/api';
import { clearDraft, loadDraft } from '@/services/drafts';

import Review from '../review';

const mockParams: { current: Record<string, string> } = { current: { roomId: 'r1' } };
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => mockParams.current }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('@/services/storage', () => ({ copyReceipt: jest.fn(), signedUrl: jest.fn() }));
const mockToast = jest.fn();
jest.mock('@/components/Toast', () => ({ useToast: () => mockToast }));
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <Review />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('확인·수정 화면', () => {
  it('박스 원본 합계와 원화 미리보기 합계를 보여준다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('10월 21일 · ¥3,280 → 29,925원')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '29,925원 저장하기' })).toBeOnTheScreen();
  });

  it('함께한 사람이 0명이면 나만 보기로 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft({ scopeMemberIds: [] }));
    expect(await screen.findByText('나만 보기 · 정산에서 빠져요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /저장하기$/ }));
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ scope_member_ids: ['m1'] }), null));
  });

  it('함께한 사람이 있으면 공동 지출로 표시한다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('공동 지출')).toBeOnTheScreen();
  });
});

describe('편집 모드', () => {
  afterEach(() => {
    mockParams.current = { roomId: 'r1' };
  });

  it('VERSION_CONFLICT면 덮어쓰지 않고 문구를 띄운 뒤 최신 지출과 version으로 draft를 바꾼다', async () => {
    mockParams.current = { roomId: 'r1', edit: 'e1', version: '3' };
    jest.mocked(api.expensePayload)
      .mockResolvedValueOnce({ payload: toSavePayload(draft(), 'm1'), version: 3 })
      .mockResolvedValueOnce({ payload: toSavePayload(draft({ merchant: '최신 가맹점' }), 'm1'), version: 4 });
    jest.mocked(api.saveExpense).mockRejectedValueOnce({ code: 'VERSION_CONFLICT', message: '다른 분이 먼저 수정했어요. 최신 내용을 불러왔어요' });
    await renderWith(draft({ merchant: '작성 중 다른 지출' }));

    expect(await screen.findByDisplayValue('이치란')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /저장하기$/ }));

    expect(await screen.findByText('다른 분이 먼저 수정했어요. 최신 내용을 불러왔어요')).toBeOnTheScreen();
    expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), 3);
    expect(await screen.findByDisplayValue('최신 가맹점')).toBeOnTheScreen();
    expect(clearDraft).not.toHaveBeenCalled();

    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 5 });
    await fireEvent.press(screen.getByRole('button', { name: /저장하기$/ }));
    expect(api.saveExpense).toHaveBeenLastCalledWith(expect.objectContaining({ merchant: '최신 가맹점' }), 4);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith('지출을 저장했어요');
  });
});
