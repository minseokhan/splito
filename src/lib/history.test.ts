import { diffSnapshots, type Snapshot } from './history';

const names = { m1: '민지', m2: '지훈', m3: '엄마' };

const base: Snapshot = {
  merchant: '이치란',
  paid_local_date: '2026-10-21',
  currency: 'JPY',
  amount_original: 3000,
  payer_kind: 'member',
  payer_member_id: 'm1',
  deleted_at: null,
  scope_member_ids: ['m1', 'm2'],
  items: [
    { id: 'i1', position: 0, name_original: 'ラーメン', name_ko: '라멘', amount_original: 2000, assignee_member_ids: [] },
    { id: 'i2', position: 1, name_original: 'ビール', name_ko: null, amount_original: 1000, assignee_member_ids: ['m1'] },
  ],
};

const next = (over: Partial<Snapshot>): Snapshot => ({ ...base, ...over });

describe('diffSnapshots', () => {
  it('create → 처음 기록', () => {
    expect(diffSnapshots(null, base, names)).toEqual(['처음 기록']);
  });

  it('delete → 삭제, restore → 복구', () => {
    expect(diffSnapshots(base, next({ deleted_at: '2026-10-22T00:00:00Z' }), names)).toEqual(['삭제']);
    expect(diffSnapshots(next({ deleted_at: '2026-10-22T00:00:00Z' }), base, names)).toEqual(['복구']);
  });

  it('금액', () => {
    expect(diffSnapshots(base, next({ amount_original: 3280 }), names)).toEqual(['금액 ¥3,000 → ¥3,280']);
  });

  it('통화 변경은 금액을 각자 통화로 표기', () => {
    expect(diffSnapshots(base, next({ currency: 'USD', amount_original: 20 }), names)).toEqual([
      '통화 JPY → USD',
      '금액 ¥3,000 → $20.00',
    ]);
  });

  it('결제일·가맹점', () => {
    expect(diffSnapshots(base, next({ paid_local_date: '2026-10-22', merchant: null }), names)).toEqual([
      '결제일 10/21 → 10/22',
      '가맹점 이치란 → (없음)',
    ]);
  });

  it('결제자(공금 포함)', () => {
    expect(diffSnapshots(base, next({ payer_member_id: 'm3' }), names)).toEqual(['결제자 민지 → 엄마']);
    expect(diffSnapshots(base, next({ payer_kind: 'pool', payer_member_id: null }), names)).toEqual(['결제자 민지 → 공금']);
  });

  it('대상 인원 추가·제외', () => {
    expect(diffSnapshots(base, next({ scope_member_ids: ['m1', 'm3'] }), names)).toEqual([
      '대상 인원에 엄마 추가',
      '대상 인원에서 지훈 제외',
    ]);
  });

  it('박스 추가·삭제·금액·지정', () => {
    const items: Snapshot['items'] = [
      { ...base.items[0], amount_original: 2280, assignee_member_ids: ['m1', 'm2'] },
      { id: 'i3', position: 1, name_original: 'Gyoza', name_ko: '교자', amount_original: 1000, assignee_member_ids: [] },
    ];
    expect(diffSnapshots(base, next({ items }), names)).toEqual([
      '라멘 ¥2,000 → ¥2,280',
      '라멘 지정 전원 → 민지, 지훈',
      '박스 추가: 교자 ¥1,000',
      '박스 삭제: ビール',
    ]);
  });

  it('바뀐 게 없으면 빈 목록', () => {
    expect(diffSnapshots(base, { ...base }, names)).toEqual([]);
  });

  it('이름을 모르는 참여자는 (알 수 없음)', () => {
    expect(diffSnapshots(base, next({ payer_member_id: 'zz' }), names)).toEqual(['결제자 민지 → (알 수 없음)']);
  });
});
