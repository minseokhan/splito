import {
  buildSettleItems,
  copyText,
  guestNoticeText,
  ledgerChangedAfterTransfer,
  recordState,
  settleHeadline,
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

describe('buildSettleItems', () => {
  it('내가 당사자인 송금안만 남기고 제3자 건은 뺀다', () => {
    const items = buildSettleItems(
      [
        { from: 'c', to: 'd', amount: 300 },
        { from: 'me', to: 'a', amount: 200 },
        { from: 'b', to: 'me', amount: 100 },
      ],
      [],
      'me',
      [],
    );
    expect(items).toEqual([
      { key: 'me>a', from: 'me', to: 'a', amount: 200, dir: 'send', state: 'need', transferId: null, onBehalfOf: null, rejected: false },
      { key: 'b>me', from: 'b', to: 'me', amount: 100, dir: 'recv', state: 'need', transferId: null, onBehalfOf: null, rejected: false },
    ]);
  });

  it('내가 대표하는 게스트 건도 내 목록에 들어오고 onBehalfOf가 붙는다', () => {
    const items = buildSettleItems([{ from: 'g', to: 'a', amount: 500 }], [], 'me', ['g']);
    expect(items).toEqual([
      { key: 'g>a', from: 'g', to: 'a', amount: 500, dir: 'send', state: 'need', transferId: null, onBehalfOf: 'g', rejected: false },
    ]);
  });

  it('기록 상태: 내가 보낸 건은 확인 대기, 받을 건은 입금 확인 필요, 확인되면 완료', () => {
    const items = buildSettleItems(
      [],
      [
        rec({ id: 'r1', from: 'me', to: 'a', amount: 100 }),
        rec({ id: 'r2', from: 'b', to: 'me', amount: 200 }),
        rec({ id: 'r3', from: 'me', to: 'c', amount: 300, confirmedAt: '2026-10-22T00:00:00Z' }),
      ],
      'me',
      [],
    );
    expect(items.map((i) => [i.transferId, i.dir, i.state])).toEqual([
      ['r2', 'recv', 'confirm'],
      ['r1', 'send', 'waiting'],
      ['r3', 'send', 'done'],
    ]);
  });

  it('취소된 기록은 빼고, 못 받았다고 표시된 건은 같은 쌍의 송금안에 rejected로 남긴다', () => {
    const items = buildSettleItems(
      [{ from: 'me', to: 'a', amount: 100 }],
      [
        rec({ id: 'r1', from: 'me', to: 'a', amount: 100, voidedAt: '2026-10-22T00:00:00Z', voidReason: 'not_received' }),
        rec({ id: 'r2', from: 'me', to: 'b', amount: 50, voidedAt: '2026-10-22T00:00:00Z', voidReason: 'cancelled' }),
      ],
      'me',
      [],
    );
    expect(items).toEqual([
      { key: 'me>a', from: 'me', to: 'a', amount: 100, dir: 'send', state: 'need', transferId: null, onBehalfOf: null, rejected: true },
    ]);
  });

  it('나와 내 게스트 사이 송금은 내 쪽(나)을 기준으로 방향을 정한다', () => {
    const items = buildSettleItems([{ from: 'g', to: 'me', amount: 700 }], [], 'me', ['g']);
    expect(items[0].dir).toBe('recv');
    expect(items[0].onBehalfOf).toBeNull();
  });
});

describe('settleHeadline', () => {
  const item = (dir: 'send' | 'recv', state: 'need' | 'waiting' | 'confirm' | 'done', amount: number) =>
    ({ key: `${dir}${state}${amount}`, from: 'x', to: 'y', amount, dir, state, transferId: null, onBehalfOf: null, rejected: false }) as const;

  it('건수와 보낼 총액을 말한다', () => {
    expect(settleHeadline([item('send', 'need', 196000), item('send', 'need', 48920), item('recv', 'confirm', 15380)])).toEqual({
      title: '보낼 돈 2건, 받을 돈 1건',
      sub: '총 244,920원을 보내주세요',
      send: 2,
      recv: 1,
    });
  });

  it('보낼 게 없으면 받을 돈을 말한다', () => {
    expect(settleHeadline([item('recv', 'confirm', 5000)])).toEqual({
      title: '보낼 돈 0건, 받을 돈 1건',
      sub: '총 5,000원을 받을 차례예요',
      send: 0,
      recv: 1,
    });
  });

  it('보낸 뒤 확인만 남으면 기다린다고 말한다', () => {
    expect(settleHeadline([item('send', 'waiting', 3000)])).toEqual({
      title: '보낼 돈 1건, 받을 돈 0건',
      sub: '상대 확인을 기다리고 있어요',
      send: 1,
      recv: 0,
    });
  });

  it('남은 게 없으면 완료 문구', () => {
    expect(settleHeadline([item('send', 'done', 100)])).toEqual({
      title: '정산할 돈이 없어요',
      sub: '모든 송금이 정리됐어요',
      send: 0,
      recv: 0,
    });
  });
});

describe('guestNoticeText', () => {
  it('보낼 돈이면 받는 사람 계좌까지 적는다', () => {
    expect(
      guestNoticeText({
        roomName: '오사카 먹방 여행',
        guestName: '엄마',
        otherName: '서연',
        dir: 'send',
        amount: 196000,
        account: { bankName: '카카오뱅크', accountNumber: '3333-01-5521234', holderName: '김서연' },
      }),
    ).toBe(
      '[오사카 먹방 여행] 정산 안내\n엄마님이 서연님에게 196,000원을 보내주세요.\n카카오뱅크 3333-01-5521234 (예금주 김서연)',
    );
  });

  it('계좌를 모르면 계좌 줄을 빼고 보낸다', () => {
    expect(
      guestNoticeText({ roomName: '여행', guestName: '엄마', otherName: '서연', dir: 'send', amount: 1000, account: null }),
    ).toBe('[여행] 정산 안내\n엄마님이 서연님에게 1,000원을 보내주세요.');
  });

  it('받을 돈이면 받게 된다고 알린다', () => {
    expect(
      guestNoticeText({ roomName: '여행', guestName: '엄마', otherName: '지훈', dir: 'recv', amount: 2500, account: null }),
    ).toBe('[여행] 정산 안내\n지훈님이 엄마님에게 2,500원을 보낼 거예요.');
  });
});

describe('recordState', () => {
  it('무효 사유로 cancelled / not_received, 아니면 confirmed / pending', () => {
    expect(recordState(rec({}))).toBe('pending');
    expect(recordState(rec({ confirmedAt: '2026-10-21T11:00:00Z' }))).toBe('confirmed');
    expect(recordState(rec({ voidedAt: '2026-10-21T11:00:00Z', voidReason: 'cancelled' }))).toBe('cancelled');
    expect(recordState(rec({ voidedAt: '2026-10-21T11:00:00Z', voidReason: 'not_received' }))).toBe('not_received');
  });
});

describe('ledgerChangedAfterTransfer', () => {
  it('유효 기록보다 지출 변경이 나중이면 true', () => {
    expect(ledgerChangedAfterTransfer([rec({})], '2026-10-21T12:00:00Z')).toBe(true);
    expect(ledgerChangedAfterTransfer([rec({})], '2026-10-21T09:00:00Z')).toBe(false);
    expect(ledgerChangedAfterTransfer([rec({ voidedAt: '2026-10-21T11:00:00Z' })], '2026-10-21T12:00:00Z')).toBe(false);
    expect(ledgerChangedAfterTransfer([], '2026-10-21T12:00:00Z')).toBe(false);
    expect(ledgerChangedAfterTransfer([rec({})], null)).toBe(false);
  });
});

describe('copyText', () => {
  it('받을 사람·금액·은행·계좌를 한 줄로', () => {
    expect(copyText({ toName: '서연', amount: 196000, bankName: '카카오뱅크', accountNumber: '3333-01-5521234' })).toBe(
      '서연에게 196,000원 · 카카오뱅크 3333-01-5521234',
    );
  });
});
