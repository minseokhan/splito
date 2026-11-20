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
  it('접힌 줄을 누르면 펼침을 화면에 알린다', async () => {
    const onToggleOpen = jest.fn();
    await render(<ItemBox {...base} people={people} onToggleOpen={onToggleOpen} />);

    await fireEvent.press(screen.getByRole('button', { name: '먹은 사람 보기' }));
    expect(onToggleOpen).toHaveBeenCalled();
  });

  it('접혀 있으면 고른 사람이 겹친 원으로만 보이고 이름 칩은 없다', async () => {
    const three = [...people, { id: 'm3', name: '지훈', colorIndex: 2, guest: false, on: false }];
    await render(<ItemBox {...base} people={three} />);

    expect(screen.getByText('서')).toBeOnTheScreen();
    expect(screen.getByText('지')).toBeOnTheScreen();
    expect(screen.queryByText('서연')).toBeNull();
  });

  it('펼치면 지정이 없어도 전원 칩이 켜진 색이다', async () => {
    await render(<ItemBox {...base} people={people} expanded />);

    expect(screen.getByText('서연')).toHaveStyle({ color: memberColor(0).fg });
    expect(screen.getByText('한결')).toHaveStyle({ color: memberColor(1).fg });
  });

  it('지정이 있으면 지정된 사람 칩만 켜진다', async () => {
    await render(<ItemBox {...base} people={[{ ...people[0], on: true }, people[1]]} expanded />);

    expect(screen.getByText('서연')).toHaveStyle({ color: memberColor(0).fg });
    expect(screen.getByText('한결')).toHaveStyle({ color: colors.ink[300] });
  });

  it('편집 모드에서 칩을 누르면 그 사람을 토글한다', async () => {
    const onToggle = jest.fn();
    await render(<ItemBox {...base} people={people} expanded onToggle={onToggle} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: '한결' }));
    expect(onToggle).toHaveBeenCalledWith('m2');
  });

  it('이름 뒤에 수량을 붙인다', async () => {
    await render(<ItemBox {...base} people={people} />);

    expect(screen.getByText('타코야키 ×2')).toBeOnTheScreen();
    expect(screen.getByText('たこ焼き ×2')).toBeOnTheScreen();
  });
});

describe('ItemBox 쪼개기·삭제', () => {
  it('쪼개기는 가위 아이콘을 붙여도 이름으로 찾을 수 있다', async () => {
    const onSplit = jest.fn();
    await render(<ItemBox {...base} people={people} onSplit={onSplit} />);

    await fireEvent.press(screen.getByRole('button', { name: '쪼개기' }));
    expect(onSplit).toHaveBeenCalled();
  });

  it('1개짜리 품목에는 쪼개기를 띄우지 않는다', async () => {
    await render(<ItemBox {...base} quantity={1} people={people} onSplit={jest.fn()} />);

    expect(screen.queryByRole('button', { name: '쪼개기' })).toBeNull();
  });

  it('쪼갠 장이면 쪼개기 대신 합치기를 띄운다', async () => {
    const onMerge = jest.fn();
    await render(<ItemBox {...base} people={people} onSplit={jest.fn()} onMerge={onMerge} />);

    expect(screen.queryByRole('button', { name: '쪼개기' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '합치기' }));
    expect(onMerge).toHaveBeenCalled();
  });

  it('삭제 X는 onRemove가 있으면 처음부터 보인다', async () => {
    const onRemove = jest.fn();
    await render(<ItemBox {...base} people={people} onRemove={onRemove} />);

    await fireEvent.press(screen.getByRole('button', { name: '이 품목 삭제' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('onRemove가 없으면 삭제 X도 없다', async () => {
    await render(<ItemBox {...base} people={people} />);

    expect(screen.queryByRole('button', { name: '이 품목 삭제' })).toBeNull();
  });
});
