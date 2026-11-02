import { fireEvent, render, screen } from '@testing-library/react-native';

import { ItemBox, type BoxPerson } from '@/components/ItemBox';
import { colors, memberColor } from '@/theme/tokens';

const people: BoxPerson[] = [
  { id: 'm1', name: '서연', colorIndex: 0, guest: false, on: false },
  { id: 'm2', name: '한결', colorIndex: 1, guest: false, on: false },
];

const base = {
  nameOriginal: 'たこ焼き',
  nameKo: '타코야키',
  quantity: 2,
  amountLabel: '¥1,600',
  krwLabel: '14,561원',
  needsReview: false,
  splitLabel: '전원 1/N',
};

describe('ItemBox 먹은 사람 펼침', () => {
  it('읽기 전용은 접혀 있다가 눌러서 펼친다', async () => {
    const onExpand = jest.fn();
    await render(<ItemBox {...base} people={people} expanded={false} onExpand={onExpand} />);

    await fireEvent.press(screen.getByRole('button', { name: '먹은 사람 보기' }));
    expect(onExpand).toHaveBeenCalled();
  });

  it('읽기 전용에서 펼치면 지정이 없어도 전원이 먹은 모양으로 보인다', async () => {
    await render(<ItemBox {...base} people={people} expanded />);

    expect(screen.getByRole('button', { name: '먹은 사람 닫기' })).toBeOnTheScreen();
    expect(screen.getByText('서')).toHaveStyle({ color: memberColor(0).fg });
    expect(screen.getByText('한')).toHaveStyle({ color: memberColor(1).fg });
  });

  it('읽기 전용에서 지정이 있으면 지정된 사람만 켜진다', async () => {
    await render(<ItemBox {...base} people={[{ ...people[0], on: true }, people[1]]} expanded />);

    expect(screen.getByText('서')).toHaveStyle({ color: memberColor(0).fg });
    expect(screen.getByText('한')).toHaveStyle({ color: colors.ink[300] });
  });

  it('편집 모드는 expanded를 안 줘도 펼친 채로 시작한다', async () => {
    await render(<ItemBox {...base} people={people} onToggle={jest.fn()} />);

    expect(screen.getByRole('button', { name: '사람 선택 닫기' })).toBeOnTheScreen();
  });
});
