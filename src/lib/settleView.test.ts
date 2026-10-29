import {
  buildCards,
  copyText,
  ledgerChangedAfterTransfer,
  pendingConfirmSummary,
  recordState,
  type TransferRecord,
} from './settleView';

const rec = (p: Partial<TransferRecord>): TransferRecord => ({
  id: 't1',
  from: 'a',
  to: 'b',
  amount: 1000,
  confirmedAt: null,
  voidedAt: null,
  voidReason: null,
  createdAt: '2026-10-21T10:00:00Z',
  ...p,
});

describe('buildCards', () => {
  it('나 기준 역할을 붙이고 내 카드를 먼저, 나머지는 원래 순서로 둔다', () => {
    const cards = buildCards(
      [
        { from: 'c', to: 'd', amount: 300 },
        { from: 'me', to: 'a', amount: 200 },
        { from: 'e', to: 'f', amount: 150 },
        { from: 'b', to: 'me', amount: 100 },
      ],
      'me',
    );
    expect(cards).toEqual([
      { from: 'me', to: 'a', amount: 200, role: 'payer' },
      { from: 'b', to: 'me', amount: 100, role: 'payee' },
      { from: 'c', to: 'd', amount: 300, role: 'observer' },
      { from: 'e', to: 'f', amount: 150, role: 'observer' },
    ]);
  });

  it('송금이 없으면 빈 배열', () => {
    expect(buildCards([], 'me')).toEqual([]);
  });
});

describe('recordState', () => {
  it('상태 4종', () => {
    expect(recordState(rec({}))).toBe('pending');
    expect(recordState(rec({ confirmedAt: '2026-10-21T11:00:00Z' }))).toBe('confirmed');
    expect(recordState(rec({ voidedAt: '2026-10-21T11:00:00Z', voidReason: 'cancelled' }))).toBe('cancelled');
    expect(recordState(rec({ voidedAt: '2026-10-21T11:00:00Z', voidReason: 'not_received' }))).toBe('not_received');
  });
});

describe('pendingConfirmSummary', () => {
  const names = { a: '민지', b: '지훈', c: '수아' };

  it('확인 대기 건수와 받을 사람 이름(중복 제거)', () => {
    const records = [
      rec({ id: '1', to: 'a' }),
      rec({ id: '2', to: 'b' }),
      rec({ id: '3', to: 'a' }),
      rec({ id: '4', to: 'c', confirmedAt: '2026-10-21T11:00:00Z' }),
      rec({ id: '5', to: 'c', voidedAt: '2026-10-21T11:00:00Z', voidReason: 'cancelled' }),
    ];
    expect(pendingConfirmSummary(records, names)).toBe('확인 대기 3건 · 민지, 지훈');
  });

  it('확인 대기가 0건이면 null', () => {
    expect(pendingConfirmSummary([], names)).toBeNull();
    expect(pendingConfirmSummary([rec({ confirmedAt: '2026-10-21T11:00:00Z' })], names)).toBeNull();
  });
});

describe('ledgerChangedAfterTransfer', () => {
  it('유효한 송금 기록 이후에 지출이 바뀌면 true', () => {
    expect(ledgerChangedAfterTransfer([rec({})], '2026-10-21T12:00:00Z')).toBe(true);
  });

  it('지출 변경이 송금 기록보다 앞서면 false', () => {
    expect(ledgerChangedAfterTransfer([rec({})], '2026-10-21T09:00:00Z')).toBe(false);
  });

  it('시간대 표기가 달라도 시각으로 비교한다', () => {
    expect(ledgerChangedAfterTransfer([rec({ createdAt: '2026-10-21T19:00:00+09:00' })], '2026-10-21T10:30:00Z')).toBe(true);
  });

  it('송금 기록이 없거나 무효 기록만 있거나 지출 변경 시각이 없으면 false', () => {
    expect(ledgerChangedAfterTransfer([], '2026-10-21T12:00:00Z')).toBe(false);
    expect(
      ledgerChangedAfterTransfer([rec({ voidedAt: '2026-10-21T11:00:00Z', voidReason: 'not_received' })], '2026-10-21T12:00:00Z'),
    ).toBe(false);
    expect(ledgerChangedAfterTransfer([rec({})], null)).toBe(false);
  });
});

describe('copyText', () => {
  it('받을 사람·금액·은행·계좌를 한 줄로', () => {
    expect(copyText({ toName: '지훈', amount: 132000, bankName: '카카오뱅크', accountNumber: '3333-01-1234567' })).toBe(
      '지훈에게 132,000원 · 카카오뱅크 3333-01-1234567',
    );
  });
});
