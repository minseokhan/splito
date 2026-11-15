import { aiChip, hiddenCount, maskWon, passRow, splitShare } from './pass';

describe('maskWon', () => {
  it('숫자+원만 ???원으로 바꾸고, 가린 개수를 센다', () => {
    expect(maskWon('어제보다 35,300원')).toEqual({ text: '어제보다 ???원', count: 1 });
    expect(maskWon('여행 첫날이에요')).toEqual({ text: '여행 첫날이에요', count: 0 });
  });
});

describe('hiddenCount', () => {
  // 화면에 ???로 바꾼 자리만 센다: 전날 대비 1 + 하루 권장 1 + 카테고리 2개×(금액·비율) + 다른 동행 3명×(결제·쓴 돈) = 12
  it('???로 가린 자리 수와 같다', () => {
    expect(hiddenCount({ compareTop: '어제보다 35,300원', baseline: true, categories: 2, others: 3 })).toBe(12);
  });
  it('금액 없는 문장·권장선 없음·카테고리 없음이면 그만큼 빠진다', () => {
    expect(hiddenCount({ compareTop: '여행 첫날이에요', baseline: false, categories: 0, others: 1 })).toBe(2);
  });
});

describe('aiChip', () => {
  it('남은 건수 → 모두 씀 → 패스 순서로 바뀐다', () => {
    expect(aiChip(3, false)).toEqual({ text: '무료 AI 인식 2건 남음', tone: 'free' });
    expect(aiChip(5, false)).toEqual({ text: '무료 AI 인식을 모두 썼어요', tone: 'out' });
    expect(aiChip(9, false).tone).toBe('out');
    expect(aiChip(5, true)).toEqual({ text: '여행 패스 · AI 인식 무제한', tone: 'pass' });
  });
});

describe('passRow', () => {
  it('무료면 사용 건수와 업그레이드, 참여자는 요청하기', () => {
    expect(passRow({ on: false, used: 3, owner: true })).toEqual({ title: '무료 이용 중', sub: 'AI 인식 3/5건 사용', button: '업그레이드' });
    expect(passRow({ on: false, used: 3, owner: false }).button).toBe('요청하기');
  });
  it('패스 이용 중이면 결제자·금액을 보이고 버튼이 없다', () => {
    expect(passRow({ on: true, used: 0, owner: true, paidBy: '이민지', splitDone: true })).toEqual({
      title: '여행 패스 이용 중',
      sub: '이민지 결제 · 5,400원 · 정산에 1/N 포함',
      button: null,
    });
  });
});

describe('splitShare', () => {
  it('1/N은 원 단위 내림', () => {
    expect(splitShare(4)).toBe(1350);
    expect(splitShare(7)).toBe(771);
    expect(splitShare(0)).toBe(5400);
  });
});
