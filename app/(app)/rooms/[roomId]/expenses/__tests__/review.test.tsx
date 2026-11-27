import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toSavePayload, type ExpenseDraft } from '@/lib/expenseForm';
import { api } from '@/services/api';
import { clearDraft, loadDraft } from '@/services/drafts';

import ExpenseDetail from '../[expenseId]';
import Review, { ExpenseEditor } from '../review';

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
    expense: jest.fn(),
    comments: jest.fn(),
    setExpenseMeta: jest.fn(),
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

async function renderWith(d: ExpenseDraft, localPhotos: string[] = [], screenEl = <Review />) {
  jest.mocked(loadDraft).mockResolvedValue({ draft: d, localPhotos });
  jest.mocked(api.roomMembers).mockResolvedValue([member('m1', '민지'), member('m2', '지훈')] as never);
  jest.mocked(api.fxRate).mockResolvedValue({ base_date: '2026-10-21', rate: 9.1234, source: 'kexim' });
  jest.mocked(api.recentExpenses).mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        {screenEl}
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('확인·수정 화면', () => {
  it('영수증 티켓 요약은 결제 통화를 크게, 원화·날짜를 따로 보여준다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    expect(screen.getByText('29,925원')).toBeOnTheScreen();
    expect(screen.getByText('10.21 (수)')).toBeOnTheScreen();
    expect(screen.getByText('품목 2개')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '29,925원 기록하기' })).toBeOnTheScreen();
  });

  it('결제자 멤버 선택은 없고, 결제자는 올린 사람(me)으로 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    expect(screen.queryByText('결제한 사람')).toBeNull();
    expect(screen.queryByRole('radio', { name: '민지(나)' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /기록하기$/ }));
    await waitFor(() =>
      expect(api.saveExpense).toHaveBeenCalledWith(
        expect.objectContaining({ payer_kind: 'member', payer_member_id: 'm1' }),
        null,
      ),
    );
  });

  it('함께한 사람 섹션은 없고, 품목 줄은 접힌 채 전원 요약을 보여준다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    expect(screen.queryByText('함께한 사람')).toBeNull();
    expect(screen.getAllByRole('button', { name: / 품목$/ })).toHaveLength(2);
    expect(screen.queryByRole('checkbox', { name: '민지' })).toBeNull();
    expect(screen.getAllByText(/^전원 2명 · 1인 /)).toHaveLength(2);
  });

  it('한 번에 한 박스만 펼친다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: / 품목$/ })[0]);
    expect(screen.getAllByRole('checkbox', { name: '민지' })).toHaveLength(1);
    await fireEvent.press(screen.getAllByRole('button', { name: / 품목$/ })[1]);
    expect(screen.getAllByRole('checkbox', { name: '민지' })).toHaveLength(1);
    await fireEvent.press(screen.getAllByRole('button', { name: / 품목$/ })[1]);
    expect(screen.queryByRole('checkbox', { name: '민지' })).toBeNull();
  });

  it('마지막 한 명은 끌 수 없다', async () => {
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: / 품목$/ })[0]);
    await fireEvent.press(screen.getByRole('checkbox', { name: '지훈' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '민지' }));
    expect(mockToast).toHaveBeenCalledWith('한 명 이상 골라 주세요');
    expect(screen.getByRole('checkbox', { name: '민지' })).toBeChecked();
  });

  it('아무도 안 고르면 공동 지출로 보고 활동 참여자 전원으로 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft());
    await screen.findByDisplayValue('이치란');
    expect(screen.queryByText('공동 지출')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /기록하기$/ }));
    await waitFor(() =>
      expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ scope_member_ids: ['m1', 'm2'] }), null),
    );
  });

  it('모든 박스를 나만 고르면 나만 보기로 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft());
    expect(await screen.findByText('¥3,280')).toBeOnTheScreen();
    // 지정 없음 = 전원 켜짐이라 지훈을 끄면 나만 남는다
    for (let i = 0; i < 2; i++) {
      await fireEvent.press(screen.getAllByRole('button', { name: / 품목$/ })[i]);
      await fireEvent.press(screen.getByRole('checkbox', { name: '지훈' }));
    }
    expect(await screen.findByText('나만 보기 · 정산에서 빠져요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /기록하기$/ }));
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ scope_member_ids: ['m1'] }), null));
  });

  it('결제일은 티켓의 날짜를 눌러 달력에서 고르고 [선택]으로 확정한다', async () => {
    await renderWith(draft());
    const trigger = await screen.findByRole('button', { name: '결제일' });
    expect(screen.getByText('10.21 (수)')).toBeOnTheScreen();

    await fireEvent.press(trigger);
    expect(screen.getByText('2026년 10월')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '영수증 날짜 10.21' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '2026년 10월 15일 (목)' }));
    expect(screen.getByText('10.15 (목)')).toBeOnTheScreen(); // 결과 줄(확정 전)
    await fireEvent.press(screen.getByRole('button', { name: '선택' }));
    expect(screen.getByText('10.15 (목)')).toBeOnTheScreen();
    expect(mockToast).toHaveBeenCalledWith('결제일을 10.15 (목)로 바꿨어요');
  });

  it('처음 들어오면 확인필요 중 첫 품목을 펼치고, [전원]은 이미 전원이면 나만 남긴다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    const d = draft();
    d.items[1] = { ...d.items[1], needsReview: true };
    await renderWith(d);
    expect(await screen.findByRole('button', { name: '맥주 품목' })).toHaveProp('accessibilityState', { expanded: true });
    expect(screen.getByRole('button', { name: '라멘 품목' })).toHaveProp('accessibilityState', { expanded: false });
    await fireEvent.press(screen.getByRole('button', { name: '전원' }));
    expect(screen.getByRole('checkbox', { name: '지훈' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: /기록하기$/ }));
    await waitFor(() =>
      expect(api.saveExpense).toHaveBeenCalledWith(
        expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ assignee_member_ids: ['m1'] })]) }),
        null,
      ),
    );
  });

  it('쪼갠 품목은 [합치기]로 원본으로 되돌린다', async () => {
    await renderWith(draft({ items: [{ id: 'i1', position: 0, nameOriginal: '', nameKo: '라멘', quantity: 2, amountOriginal: 2000, needsReview: false, isAdjustment: false, assigneeMemberIds: [] }] }));
    await fireEvent.press(await screen.findByRole('button', { name: '라멘 품목' }));
    await fireEvent.press(screen.getByRole('button', { name: '쪼개기' }));
    expect(screen.getByText('품목 2개')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: '라멘 품목' })[0]);
    await fireEvent.press(screen.getByRole('button', { name: '합치기' }));
    expect(screen.getByText('품목 1개')).toBeOnTheScreen();
    expect(mockToast).toHaveBeenCalledWith('‘라멘 ×2’로 다시 합쳤어요');
  });

  it('정산할 곳·통화 칩은 없고, 카테고리 줄을 눌러 시트에서 고른 값을 저장한다', async () => {
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 1 });
    await renderWith(draft());
    await fireEvent.press(await screen.findByRole('button', { name: '카테고리 · 기타' }));
    expect(screen.queryByText('정산할 곳')).toBeNull();
    expect(screen.queryByText('통화')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: '식비' }));
    expect(screen.getByRole('button', { name: '카테고리 · 식비' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /기록하기$/ }));
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ category: 'food' }), null));
  });
});

describe('영수증·품목 금액', () => {
  it('영수증 썸네일을 누르면 크게 본다', async () => {
    await renderWith(draft(), ['file:///receipt.jpg']);
    await fireEvent.press(await screen.findByRole('imagebutton', { name: '영수증 크게 보기' }));
    expect(screen.getByRole('button', { name: '닫기' })).toBeOnTheScreen();
  });

  it('품목을 펼쳐도 금액 앞 통화 기호가 남는다', async () => {
    await renderWith(draft());
    await fireEvent.press(await screen.findByRole('button', { name: '라멘 품목' }));
    expect(screen.getByDisplayValue('2,000')).toBeOnTheScreen();
    expect(screen.getByText('¥')).toBeOnTheScreen();
  });

  it('펼치면 개수는 × 없이 숫자만 고치고, 접으면 ×N으로 보인다', async () => {
    await renderWith(draft());
    await fireEvent.press(await screen.findByRole('button', { name: '라멘 품목' }));
    expect(screen.queryByText(/×/)).toBeNull();
    await fireEvent.changeText(screen.getAllByLabelText('품목 개수')[0], '3x');
    expect(screen.getByDisplayValue('3')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '라멘 품목' }));
    expect(screen.getByText(' ×3')).toBeOnTheScreen();
  });

  it('펼친 줄 입력칸에서 금액을 고치면 쉼표가 붙고 총액·저장 버튼이 바로 바뀌며 확인 필요가 풀린다', async () => {
    const d = draft();
    d.items[1] = { ...d.items[1], needsReview: true };
    await renderWith(d);
    await screen.findByRole('button', { name: '맥주 품목' });
    expect(screen.getByRole('button', { name: '확인 필요 해제' })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('품목 금액'), '2280');
    expect(screen.getByDisplayValue('2,280')).toBeOnTheScreen();
    // (2000 + 2280) × 9.1234 = 39048.15
    expect(screen.getByRole('button', { name: /39,048.*기록하기$/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '확인 필요 해제' })).toBeNull();
  });

  it('새 품목은 품목명 칸이 빈 채로 시작한다', async () => {
    await renderWith(draft());
    await fireEvent.press(await screen.findByRole('button', { name: /품목 추가/ }));
    await fireEvent.press(screen.getByRole('button', { name: '품목명을 입력해 주세요 품목' }));
    expect(screen.getByLabelText('품목 이름')).toHaveProp('value', '');
    expect(screen.getByLabelText('품목 금액')).toHaveProp('value', '');
  });
});

describe('지출 상세(그 자리에서 고치기)', () => {
  afterEach(() => {
    mockParams.current = { roomId: 'r1' };
  });

  // 상세 화면 = 편집 모드 편집기 + 댓글·삭제. createdBy가 u1(나)이 아니면 남이 올린 지출이다.
  async function renderDetail(d: ExpenseDraft, over: { createdBy?: string; payer?: string; scheduleId?: string | null } = {}) {
    mockParams.current = { roomId: 'r1', expenseId: 'e1' };
    jest.mocked(api.expense).mockResolvedValue({
      id: 'e1', room_id: 'r1', version: 3, created_at: '2026-10-21T00:00:00Z', created_by: over.createdBy ?? 'u1',
      payer_kind: 'member', payer_member_id: over.payer ?? 'm1', fx_source: 'kexim', paid_local_date: '2026-10-21',
      currency: 'JPY', schedule_id: over.scheduleId ?? null,
    } as never);
    jest.mocked(api.comments).mockResolvedValue([]);
    await renderWith(d, [], <ExpenseDetail />);
  }

  it('제목은 지출 상세, 아래 버튼은 [삭제]·[수정하기]이고 고치기 전에는 수정하기가 꺼져 있다', async () => {
    jest.mocked(api.expensePayload).mockResolvedValue({ payload: toSavePayload(draft(), 'm1', ['m1', 'm2']), version: 3 });
    await renderDetail(draft());
    const input = await screen.findByDisplayValue('이치란');
    expect(screen.getByText('지출 상세')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '댓글 0개' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '지출 메뉴' })).toBeNull();
    expect(screen.getByRole('button', { name: '삭제' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
    await fireEvent.changeText(input, '이치란 본점');
    expect(screen.getByRole('button', { name: '수정하기' })).toBeEnabled();
  });

  it('[수정하기]는 저장하고 돌아가며 토스트를 띄운다. 일정은 바꾸지 않았으면 다시 붙이지 않는다', async () => {
    jest.mocked(api.expensePayload).mockResolvedValue({ payload: toSavePayload(draft(), 'm1', ['m1', 'm2']), version: 3 });
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 4 });
    await renderDetail(draft());
    await fireEvent.changeText(await screen.findByDisplayValue('이치란'), '이치란 본점');
    await fireEvent.press(screen.getByRole('button', { name: '수정하기' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ merchant: '이치란 본점' }), 3);
    expect(api.setExpenseMeta).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('지출을 수정했어요');
  });

  it('올린 사람(결제자)이 아니면 [삭제] 버튼 자체가 없다', async () => {
    jest.mocked(api.expensePayload).mockResolvedValue({ payload: toSavePayload(draft({ payerMemberId: 'm2' }), 'm1', ['m1', 'm2']), version: 3 });
    await renderDetail(draft(), { createdBy: 'u2', payer: 'm2' });
    await screen.findByDisplayValue('이치란');
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
    expect(screen.getByRole('button', { name: '수정하기' })).toBeOnTheScreen();
  });

  it('올린 사람이 [삭제]를 누르면 가운데 확인 다이얼로그를 띄운다', async () => {
    jest.mocked(api.expensePayload).mockResolvedValue({ payload: toSavePayload(draft(), 'm1', ['m1', 'm2']), version: 3 });
    await renderDetail(draft());
    await screen.findByDisplayValue('이치란');
    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
    expect(screen.getByText('이 지출을 삭제할까요?')).toBeOnTheScreen();
    expect(screen.getByText('정산 금액이 다시 계산돼요.')).toBeOnTheScreen();
  });
});

describe('편집 모드', () => {
  afterEach(() => {
    mockParams.current = { roomId: 'r1' };
  });

  it('[수정하기]는 불러온 그대로면 꺼져 있고, 고치면 켜지고, 되돌리면 다시 꺼진다', async () => {
    jest.mocked(api.expensePayload).mockResolvedValueOnce({ payload: toSavePayload(draft(), 'm1', ['m1', 'm2']), version: 3 });
    await renderWith(draft(), [], <ExpenseEditor roomId="r1" edit="e1" version={3} />);

    const input = await screen.findByDisplayValue('이치란');
    expect(screen.queryByRole('button', { name: /기록하기$/ })).toBeNull();
    expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
    await fireEvent.changeText(input, '이치란 본점');
    expect(screen.getByRole('button', { name: '수정하기' })).toBeEnabled();
    await fireEvent.changeText(input, '이치란');
    expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
  });

  it('VERSION_CONFLICT면 덮어쓰지 않고 문구를 띄운 뒤 최신 지출과 version으로 draft를 바꾼다', async () => {
    jest.mocked(api.expensePayload)
      .mockResolvedValueOnce({ payload: toSavePayload(draft(), 'm1', ['m1', 'm2']), version: 3 })
      .mockResolvedValueOnce({ payload: toSavePayload(draft({ merchant: '최신 가맹점' }), 'm1', ['m1', 'm2']), version: 4 });
    jest.mocked(api.saveExpense).mockRejectedValueOnce({ code: 'VERSION_CONFLICT', message: '다른 분이 먼저 수정했어요. 최신 내용을 불러왔어요' });
    await renderWith(draft({ merchant: '작성 중 다른 지출' }), [], <ExpenseEditor roomId="r1" edit="e1" version={3} />);

    await fireEvent.changeText(await screen.findByDisplayValue('이치란'), '이치란 본점');
    await fireEvent.press(screen.getByRole('button', { name: '수정하기' }));

    expect(await screen.findByText('다른 분이 먼저 수정했어요. 최신 내용을 불러왔어요')).toBeOnTheScreen();
    expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), 3);
    expect(await screen.findByDisplayValue('최신 가맹점')).toBeOnTheScreen();
    expect(clearDraft).not.toHaveBeenCalled();

    // 최신 지출이 새 기준이라 다시 고쳐야 켜진다.
    expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
    await fireEvent.changeText(screen.getByDisplayValue('최신 가맹점'), '최신 가맹점 2');
    jest.mocked(api.saveExpense).mockResolvedValueOnce({ id: 'e1', version: 5 });
    await fireEvent.press(screen.getByRole('button', { name: '수정하기' }));
    expect(api.saveExpense).toHaveBeenLastCalledWith(expect.objectContaining({ merchant: '최신 가맹점 2' }), 4);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith('지출을 수정했어요');
  });
});
