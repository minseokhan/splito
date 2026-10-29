import { findDuplicate, merchantSimilarity, normalizeMerchant, type DupCandidate } from './duplicate';

const now = new Date('2026-10-22T12:00:00Z');

const draft = {
  merchant: 'Ichiran Dotonbori',
  paidLocalDate: '2026-10-21',
  paidLocalTime: '18:42',
  currency: 'JPY',
  amountOriginal: 3280,
  krwAmount: 29920 as number | null,
};

function cand(over: Partial<DupCandidate> = {}): DupCandidate {
  return {
    id: 'e1',
    merchant: 'ICHIRAN DOTONBORI',
    paidLocalDate: '2026-10-21',
    paidLocalTime: '18:42',
    currency: 'JPY',
    amountOriginal: 3280,
    krwAmount: 29920,
    createdAt: '2026-10-21T10:00:00Z',
    ...over,
  };
}

describe('normalizeMerchant', () => {
  it('소문자, 공백·기호 제거, 전각→반각', () => {
    expect(normalizeMerchant('ＩＣＨＩＲＡＮ  道頓堀店!')).toBe('ichiran道頓堀店');
    expect(normalizeMerchant("McDonald's (Namba)")).toBe('mcdonaldsnamba');
    expect(normalizeMerchant(null)).toBe('');
  });
});

describe('merchantSimilarity', () => {
  it('정규화 후 같으면 1, 포함 관계면 1', () => {
    expect(merchantSimilarity('Ichiran Dotonbori', 'ICHIRAN DOTONBORI')).toBe(1);
    expect(merchantSimilarity('Ichiran', 'ICHIRAN Dotonbori')).toBe(1);
  });
  it('겹치는 bigram이 없으면 0, null·빈 값이면 0', () => {
    expect(merchantSimilarity('ICHIRAN 道頓堀', '이치란')).toBe(0);
    expect(merchantSimilarity(null, '이치란')).toBe(0);
    expect(merchantSimilarity('!!', '이치란')).toBe(0);
  });
  it('bigram Dice', () => {
    // night/nacht: bigram {ni,ig,gh,ht} vs {na,ac,ch,ht} → 2*1/8
    expect(merchantSimilarity('night', 'nacht')).toBe(0.25);
  });
});

describe('findDuplicate', () => {
  it('기준을 모두 만족하면 후보', () => {
    expect(findDuplicate(draft, [cand()], now)?.id).toBe('e1');
  });

  it('금액 ±20% 경계', () => {
    expect(findDuplicate(draft, [cand({ amountOriginal: 3936 })], now)).not.toBeNull(); // +20%
    expect(findDuplicate(draft, [cand({ amountOriginal: 2624 })], now)).not.toBeNull(); // −20%
    expect(findDuplicate(draft, [cand({ amountOriginal: 3937 })], now)).toBeNull();
    expect(findDuplicate(draft, [cand({ amountOriginal: 2623 })], now)).toBeNull();
  });

  it('통화가 다르면 krw로 비교, 한쪽 krw가 없으면 후보 아님', () => {
    const krwDraft = { ...draft, currency: 'KRW', amountOriginal: 30000, krwAmount: 30000 };
    expect(findDuplicate(krwDraft, [cand()], now)).not.toBeNull();
    expect(findDuplicate(krwDraft, [cand({ krwAmount: 23999 })], now)).toBeNull();
    expect(findDuplicate(krwDraft, [cand({ krwAmount: null })], now)).toBeNull();
    expect(findDuplicate({ ...krwDraft, krwAmount: null }, [cand()], now)).toBeNull();
  });

  it('둘 다 시각이 있으면 2시간 이내(자정 넘김 포함)', () => {
    expect(findDuplicate(draft, [cand({ paidLocalTime: '20:42' })], now)).not.toBeNull();
    expect(findDuplicate(draft, [cand({ paidLocalTime: '20:43' })], now)).toBeNull();
    expect(findDuplicate(draft, [cand({ paidLocalTime: '16:42:00' })], now)).not.toBeNull();
    const lateDraft = { ...draft, paidLocalTime: '23:30' };
    expect(findDuplicate(lateDraft, [cand({ paidLocalDate: '2026-10-22', paidLocalTime: '00:30' })], now)).not.toBeNull();
  });

  it('한쪽 시각이 없으면 같은 날', () => {
    expect(findDuplicate(draft, [cand({ paidLocalTime: null })], now)).not.toBeNull();
    expect(findDuplicate(draft, [cand({ paidLocalTime: null, paidLocalDate: '2026-10-20' })], now)).toBeNull();
  });

  it('가맹점이 다르거나 null이면 후보 아님', () => {
    expect(findDuplicate(draft, [cand({ merchant: '이치란' })], now)).toBeNull();
    expect(findDuplicate({ ...draft, merchant: 'ICHIRAN 道頓堀' }, [cand({ merchant: '이치란' })], now)).toBeNull();
    expect(findDuplicate(draft, [cand({ merchant: null })], now)).toBeNull();
    expect(findDuplicate({ ...draft, merchant: null }, [cand()], now)).toBeNull();
  });

  it('createdAt 72시간 밖은 제외', () => {
    expect(findDuplicate(draft, [cand({ createdAt: '2026-10-19T12:00:00Z' })], now)).not.toBeNull();
    expect(findDuplicate(draft, [cand({ createdAt: '2026-10-19T11:59:59Z' })], now)).toBeNull();
  });

  it('여러 후보 중 점수가 가장 높은 1건', () => {
    const recent = [
      cand({ id: 'far', amountOriginal: 3800, merchant: 'Ichiran Dotonbori Honten' }),
      cand({ id: 'best' }),
      cand({ id: 'other', merchant: 'Kura Sushi' }),
    ];
    expect(findDuplicate(draft, recent, now)?.id).toBe('best');
    expect(findDuplicate(draft, [], now)).toBeNull();
  });
});
