import { render, screen } from '@testing-library/react-native';

import { AvatarStack, type AvatarPerson } from '@/components/AvatarStack';

const NAMES = ['민지', '지훈', '서연', '엄마', '한결', '도윤'];
const people = (n: number): AvatarPerson[] =>
  NAMES.slice(0, n).map((name, i) => ({ id: `m${i}`, name, colorIndex: i, guest: false }));

describe('AvatarStack — 원은 4개를 넘지 않는다', () => {
  it('4명이면 전부 보여주고 +n은 없다', async () => {
    await render(<AvatarStack people={people(4)} />);

    for (const name of NAMES.slice(0, 4)) expect(screen.getByLabelText(name)).toBeOnTheScreen();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('6명이면 앞 3명 + "+3" 원만 보여준다(총 4개)', async () => {
    await render(<AvatarStack people={people(6)} />);

    for (const name of NAMES.slice(0, 3)) expect(screen.getByLabelText(name)).toBeOnTheScreen();
    expect(screen.queryByLabelText('엄마')).toBeNull();
    expect(screen.getByText('+3')).toBeOnTheScreen();
  });
});
