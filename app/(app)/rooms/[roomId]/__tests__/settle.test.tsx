import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/services/api';
import type { BalanceRow } from '@/types/domain';

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
    getPayoutAccount: jest.fn(),
    expensePayload: jest.fn(),
    saveExpense: jest.fn(),
  },
}));

const member = (id: string, userId: string, name: string) => ({
  id, kind: 'user', userId, name, avatarUrl: null,
  representativeMemberId: null, joinedAt: '2026-10-20T00:00:00Z', leftAt: null,
});

const guestMember = (id: string, name: string, rep: string) => ({
  id, kind: 'guest', userId: null, name, avatarUrl: null,
  representativeMemberId: rep, joinedAt: '2026-10-20T00:00:01Z', leftAt: null,
});

const privateRow = (id: string, merchant: string, paidLocalDate: string) => ({
  id, merchant, paidLocalDate, currency: 'KRW', amountOriginal: 12000, krwAmount: 12000,
});

const balanceRow = (id: string, paid: number, owed: number, net: number): BalanceRow => ({
  memberId: id, kind: 'user', representativeMemberId: null,
  joinedAt: '2026-10-20T00:00:00Z', leftAt: null, paid, owed, net,
});

const ZERO_ROWS = ['m1', 'm2'].map((id) => balanceRow(id, 0, 0, 0));

const TWO_MEMBERS = [member('m1', 'u1', '민지'), member('m2', 'u2', '지훈')];

async function renderSettle(privates: ReturnType<typeof privateRow>[], rows = ZERO_ROWS, members: unknown[] = TWO_MEMBERS) {
  jest.mocked(api.roomMembers).mockResolvedValue(members as never);
  jest.mocked(api.roomBalances).mockResolvedValue({ fxPendingCount: 0, rows });
  jest.mocked(api.transfers).mockResolvedValue([]);
  jest.mocked(api.lastExpenseChangeAt).mockResolvedValue(null);
  jest.mocked(api.feed).mockResolvedValue([]);
  jest.mocked(api.room).mockResolvedValue({ id: 'r1', pool_enabled: false, pool_owner_member_id: null } as never);
  jest.mocked(api.poolDeposits).mockResolvedValue([]);
  jest.mocked(api.myPrivateExpenses).mockResolvedValue(privates);
  jest.mocked(api.getPayoutAccount).mockResolvedValue(null as never);
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

describe('보낼 돈 · 받을 돈 탭', () => {
  beforeEach(() => jest.clearAllMocks());

  // 내가 m2에게 30,000원 줘야 하는 상황
  const payerRows = [balanceRow('m1', 0, 30000, -30000), balanceRow('m2', 30000, 0, 30000)];

  it('보낼 돈 카드에 상태 배지·양쪽 이름·금액을 보여준다', async () => {
    await renderSettle([], payerRows);
    expect(await screen.findByText('송금 필요')).toBeOnTheScreen();
    expect(screen.getByText('보낼 돈 1건, 받을 돈 0건')).toBeOnTheScreen();
    expect(screen.getByText('총 30,000원을 보내주세요')).toBeOnTheScreen();
    expect(screen.getByText('나')).toBeOnTheScreen();
    expect(screen.getAllByText('지훈')).toHaveLength(1); // 순잔액 표는 더 이상 없다
    expect(screen.getByText('30,000원')).toBeOnTheScreen();
  });

  it('제3자끼리의 송금은 보여주지 않는다', async () => {
    const rows = [balanceRow('m1', 0, 0, 0), balanceRow('m2', 30000, 0, 30000), balanceRow('m3', 0, 30000, -30000)];
    await renderSettle([], rows, [...TWO_MEMBERS, member('m3', 'u3', '서연')]);
    expect(await screen.findByText('정산할 돈이 없어요')).toBeOnTheScreen();
    expect(screen.queryByText('송금 필요')).toBeNull();
  });

  it('받을 돈 탭으로 바꾸면 그 탭의 카드만 본다', async () => {
    await renderSettle([], payerRows);
    await fireEvent.press(await screen.findByRole('tab', { name: '받을 돈 0건' }));
    expect(screen.getByText('받을 돈이 없어요')).toBeOnTheScreen();
    expect(screen.queryByText('송금 필요')).toBeNull();
  });
});

describe('게스트 정산', () => {
  beforeEach(() => jest.clearAllMocks());

  it('내가 대표하는 게스트의 송금도 내 화면에 뜨고, 알려주기 버튼이 붙는다', async () => {
    await renderSettle(
      [],
      [
        balanceRow('m1', 0, 0, 0),
        balanceRow('m2', 5000, 0, 5000),
        { ...balanceRow('g1', 0, 5000, -5000), kind: 'guest', representativeMemberId: 'm1' },
      ],
      [...TWO_MEMBERS, guestMember('g1', '엄마', 'm1')],
    );
    expect(await screen.findByText('송금 필요')).toBeOnTheScreen();
    expect(screen.getByText('엄마')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '엄마에게 알리기' })).toBeOnTheScreen();
  });
});
