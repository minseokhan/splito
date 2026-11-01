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
    category: 'other', items: [item('i1', 0, '라멘', 2000), item('i2', 1, '맥주', 1280)],
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
  it('상단 결제 박스는 현지 통화를 크게, 원화·날짜를 따로 보여준다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    expect(screen.getByText('29,925원')).toBeOnTheScreen();
    expect(screen.getByText('10월 21일')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '29,925원 저장하기' })).toBeOnTheScreen();
  });

  it('결제자 멤버 선택은 없고, 결제자는 올린 사람(me)으로 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    expect(screen.queryByText('결제한 사람')).toBeNull();
    expect(screen.queryByRole('radio', { name: '민지(나)' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /저장하기$/ }));
    await waitFor(() =>
      expect(api.saveExpense).toHaveBeenCalledWith(
        expect.objectContaining({ payer_kind: 'member', payer_member_id: 'm1' }),
        null,
      ),
    );
  });

  it('함께한 사람 섹션은 없고, 박스마다 참여자 전원이 펼쳐진 채로 보인다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    expect(screen.queryByText('함께한 사람')).toBeNull();
    // 펼친 상태로 시작하므로 접는 체크 버튼이 박스마다 있고, 펼치기 버튼은 없다.
    expect(screen.queryByRole('button', { name: '먹은 사람 고르기' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '사람 선택 닫기' })).toHaveLength(2);
    // 박스 2개 × 참여자 2명
    expect(screen.getAllByRole('checkbox', { name: '민지' })).toHaveLength(2);
    expect(screen.getAllByRole('checkbox', { name: '지훈' })).toHaveLength(2);
    expect(screen.getAllByText('전원 1/N')).toHaveLength(2);
  });

  it('체크를 누르면 그 박스만 접히고 다시 누르면 펼쳐진다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: '사람 선택 닫기' })[0]);
    // 접힌 박스 1개 + 펼친 박스 1개
    expect(screen.getAllByRole('button', { name: '사람 선택 닫기' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '먹은 사람 고르기' })).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: '먹은 사람 고르기' }));
    expect(screen.getAllByRole('button', { name: '사람 선택 닫기' })).toHaveLength(2);
  });

  it('아무도 안 고르면 공동 지출로 보고 활동 참여자 전원으로 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft());
    expect(await screen.findByText('공동 지출')).toBeOnTheScreen();
    expect(screen.getByText('박스마다 먹은 사람을 눌러주세요. 안 누르면 전원이 1/N로 나눠요.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /저장하기$/ }));
    await waitFor(() =>
      expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ scope_member_ids: ['m1', 'm2'] }), null),
    );
  });

  it('모든 박스를 나만 고르면 나만 보기로 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    for (let i = 0; i < 2; i++) await fireEvent.press(screen.getAllByRole('checkbox', { name: '민지' })[i]);
    expect(await screen.findByText('나만 보기 · 정산에서 빠져요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /저장하기$/ }));
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ scope_member_ids: ['m1'] }), null));
  });

  it('결제일은 직접 치지 않고 달력에서 고른다', async () => {
    await renderWith(draft());
    const trigger = await screen.findByRole('button', { name: '결제일' });
    expect(screen.getByText('2026년 10월 21일 (수)')).toBeOnTheScreen();

    await fireEvent.press(trigger);
    expect(screen.getByText('2026년 10월')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '2026년 10월 15일 (목)' }));
    expect(screen.getByText('2026년 10월 15일 (목)')).toBeOnTheScreen();
  });

  it('카테고리 칩으로 고른 값을 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft());
    await fireEvent.press(await screen.findByRole('radio', { name: '식비' }));
    await fireEvent.press(screen.getByRole('button', { name: /저장하기$/ }));
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ category: 'food' }), null));
  });
});

describe('편집 모드', () => {
  afterEach(() => {
    mockParams.current = { roomId: 'r1' };
  });

  it('VERSION_CONFLICT면 덮어쓰지 않고 문구를 띄운 뒤 최신 지출과 version으로 draft를 바꾼다', async () => {
    mockParams.current = { roomId: 'r1', edit: 'e1', version: '3' };
    jest.mocked(api.expensePayload)
      .mockResolvedValueOnce({ payload: toSavePayload(draft(), 'm1', ['m1', 'm2']), version: 3 })
      .mockResolvedValueOnce({ payload: toSavePayload(draft({ merchant: '최신 가맹점' }), 'm1', ['m1', 'm2']), version: 4 });
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
