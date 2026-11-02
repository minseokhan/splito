import { repChangeWarning } from './guestView';

describe('repChangeWarning', () => {
  it('대표자가 바뀌면 대신 눌러줄 사람이 바뀐다고 알린다(금액은 옮겨지지 않는다)', () => {
    expect(repChangeWarning('엄마', '지훈')).toBe('이제 지훈 님이 엄마의 송금을 대신 기록하고 알려줘요');
  });
});
