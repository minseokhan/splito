import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RoomForm } from '../RoomForm';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function setup(onSubmit: jest.Mock) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RoomForm
        heading="여행 정보를 바꿔요"
        submitLabel="저장"
        defaultValues={{ name: '오사카 먹방 여행', baseCurrency: 'JPY', startDate: '2026-10-20', endDate: '2026-10-25' }}
        onSubmit={onSubmit}
      />
    </SafeAreaProvider>,
  );
}

describe('RoomForm', () => {
  it('받은 값으로 채워서 보여준다', async () => {
    await setup(jest.fn());
    expect(screen.getByLabelText('여행 이름').props.value).toBe('오사카 먹방 여행');
    expect(screen.getByText('10월 20일')).toBeTruthy();
    expect(screen.getByText('10월 25일')).toBeTruthy();
  });

  it('이름을 고쳐 저장하면 앞뒤 공백을 떼고 넘긴다', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await setup(onSubmit);
    await fireEvent.changeText(screen.getByLabelText('여행 이름'), '  교토 여행  ');
    await fireEvent.press(screen.getByText('저장'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: '교토 여행',
        baseCurrency: 'JPY',
        startDate: '2026-10-20',
        endDate: '2026-10-25',
      }),
    );
  });
});
