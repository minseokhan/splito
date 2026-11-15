import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PassSheet } from '../PassSheets';
import { CategoryCard, MatesCard } from '../StatsCharts';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

describe('PassSheet', () => {
  it('방장: 사유 배지·1/N 몫을 보이고, 고른 결제 수단과 나누기 여부로 결제한다', async () => {
    const onPay = jest.fn();
    await wrap(<PassSheet visible reason="stats" owner memberCount={4} onClose={jest.fn()} onPay={onPay} onRequest={jest.fn()} />);
    expect(screen.getByText('내 통계는 여행 패스 기능이에요')).toBeTruthy();
    expect(screen.getByText('지출로 등록돼 정산에 포함 · 1인 1,350원')).toBeTruthy();
    await fireEvent.press(screen.getByText('카카오페이'));
    await fireEvent.press(screen.getByText('동행과 1/N로 나누기'));
    await fireEvent.press(screen.getByText('5,400원 결제하기'));
    expect(onPay).toHaveBeenCalledWith({ split: false, method: '카카오페이' });
  });

  it('참여자: 결제 수단 대신 안내를 보이고 방장에게 요청한다', async () => {
    const onRequest = jest.fn();
    await wrap(<PassSheet visible owner={false} memberCount={4} onClose={jest.fn()} onPay={jest.fn()} onRequest={onRequest} />);
    expect(screen.queryByText('결제 수단')).toBeNull();
    await fireEvent.press(screen.getByText('방장에게 결제 요청하기'));
    expect(onRequest).toHaveBeenCalled();
  });
});

describe('잠금 표시', () => {
  it('카테고리: 금액 대신 ???원, 누르면 onLocked', async () => {
    const onPick = jest.fn();
    const onLocked = jest.fn();
    await render(<CategoryCard rows={[{ code: 'food', label: '식비', amount: 12000, ratio: 1 }]} onPick={onPick} locked onLocked={onLocked} />);
    // 행 금액은 ???원, 머리의 합계는 글자를 투명하게 해서 흐리게만 보인다(시안 blur)
    expect(screen.getByText('???원')).toBeTruthy();
    expect(screen.getByText('12,000원')).toHaveStyle({ color: 'transparent' });
    expect(screen.getByText('??%')).toBeTruthy(); // 비율도 가린다
    await fireEvent.press(screen.getByLabelText('식비'));
    expect(onLocked).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('동행: 가린 사람만 ???원, 내 금액은 보인다', async () => {
    const base = { initial: 'x', tint: '#fff', fg: '#000' };
    await render(
      <MatesCard
        rows={[
          { ...base, id: 'me', name: '나', paid: 10000, owed: 5000 },
          { ...base, id: 'b', name: '지훈', paid: 0, owed: 5000, masked: true },
        ]}
      />,
    );
    expect(screen.getByText('10,000원')).toBeTruthy();
    expect(screen.getAllByText('???원')).toHaveLength(2);
  });
});
