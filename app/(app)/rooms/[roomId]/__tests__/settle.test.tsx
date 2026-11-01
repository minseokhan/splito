import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/services/api';

import Settle from '../settle';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ roomId: 'r1' }),
}));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('@/components/Toast', () => ({ useToast: () => jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/services/api', () => ({
  api: {
    roomBalances: jest.fn(),
    roomMembers: jest.fn(),
    transfers: jest.fn(),
    lastExpenseChangeAt: jest.fn(),
    feed: jest.fn(),
    room: jest.fn(),
    poolDeposits: jest.fn(),
    myPrivateExpenses: jest.fn(),
    expensePayload: jest.fn(),
    saveExpense: jest.fn(),
  },
}));

const member = (id: string, userId: string, name: string) => ({
  id, kind: 'user', userId, name, avatarUrl: null,
  representativeMemberId: null, joinedAt: '2026-10-20T00:00:00Z', leftAt: null,
});

const privateRow = (id: string, merchant: string, paidLocalDate: string) => ({
  id, merchant, paidLocalDate, currency: 'KRW', amountOriginal: 12000, krwAmount: 12000,
});

async function renderSettle(privates: ReturnType<typeof privateRow>[]) {
  jest.mocked(api.roomMembers).mockResolvedValue([member('m1', 'u1', '민지'), member('m2', 'u2', '지훈')] as never);
  jest.mocked(api.roomBalances).mockResolvedValue({
    fxPendingCount: 0,
    rows: ['m1', 'm2'].map((id) => ({
      memberId: id, kind: 'user' as const, representativeMemberId: null,
      joinedAt: '2026-10-20T00:00:00Z', leftAt: null, paid: 0, owed: 0, net: 0,
    })),
  });
  jest.mocked(api.transfers).mockResolvedValue([]);
  jest.mocked(api.lastExpenseChangeAt).mockResolvedValue(null);
  jest.mocked(api.feed).mockResolvedValue([]);
  jest.mocked(api.room).mockResolvedValue({ id: 'r1', pool_enabled: false, pool_owner_member_id: null } as never);
  jest.mocked(api.poolDeposits).mockResolvedValue([]);
  jest.mocked(api.myPrivateExpenses).mockResolvedValue(privates);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <Settle />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('정산 전 나만 보기 확인 단계', () => {
  beforeEach(() => jest.clearAllMocks());

  it('나만 보기가 0건이면 확인 화면 없이 바로 정산 화면을 보여준다', async () => {
    await renderSettle([]);
    expect(await screen.findByText('정산할 돈이 없어요')).toBeOnTheScreen();
    expect(screen.queryByText(/나만 보기로 저장된 지출/)).toBeNull();
  });

  it('나만 보기가 있으면 건수 안내와 목록을 날짜순으로 보여주고 정산 화면은 아직 띄우지 않는다', async () => {
    await renderSettle([privateRow('e1', '이치란', '2026-10-21'), privateRow('e2', '세븐일레븐', '2026-10-22')]);
    expect(await screen.findByText('나만 보기로 저장된 지출 2건 중 동행과 함께한 건 없나요?')).toBeOnTheScreen();
    expect(screen.getByText('이치란')).toBeOnTheScreen();
    expect(screen.queryByText('정산할 돈이 없어요')).toBeNull();
  });

  it('고른 동행을 대상 인원에 더해 저장한 뒤 정산 화면으로 넘어간다', async () => {
    jest.mocked(api.expensePayload).mockResolvedValue({
      version: 3,
      payload: { id: 'e1', room_id: 'r1', scope_member_ids: ['m1'] } as never,
    });
    jest.mocked(api.saveExpense).mockResolvedValue({ id: 'e1', version: 4 });
    await renderSettle([privateRow('e1', '이치란', '2026-10-21')]);

    await fireEvent.press(await screen.findByRole('checkbox', { name: '동행 지훈' }));
    await fireEvent.press(screen.getByRole('button', { name: '정산으로 넘어가기' }));

    await waitFor(() => expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ scope_member_ids: ['m1', 'm2'] }), 3));
    expect(await screen.findByText('정산할 돈이 없어요')).toBeOnTheScreen();
  });

  it('동행을 고르지 않고 넘어가면 아무것도 저장하지 않는다', async () => {
    await renderSettle([privateRow('e1', '이치란', '2026-10-21')]);
    await fireEvent.press(await screen.findByRole('button', { name: '정산으로 넘어가기' }));
    expect(await screen.findByText('정산할 돈이 없어요')).toBeOnTheScreen();
    expect(api.saveExpense).not.toHaveBeenCalled();
  });
});
