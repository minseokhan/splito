import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScheduleSheet, type ScheduleDraft } from '@/components/ScheduleSheet';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
const days = [{ dayIndex: 1, label: '1일차' }];
const imported: ScheduleDraft = {
  id: 's1',
  dayIndex: 1,
  startTime: '09:30',
  title: '오사카성 공원',
  includes: [],
  optional: false,
  estAmount: 0,
};

// 노션 27번: 일정 추가·수정 시트에서 시간 입력을 없앤다. 예약에서 불러온 시간은 그대로 둔다.
describe('ScheduleSheet 시간 입력 없음', () => {
  it('패키지 일정 수정에도 시간 칸이 없고, 저장하면 불러온 시간을 그대로 보낸다', async () => {
    const onSave = jest.fn();
    await wrap(<ScheduleSheet draft={imported} days={days} pkg onClose={jest.fn()} onSave={onSave} />);

    expect(screen.queryByText('시간 (선택)')).toBeNull();
    expect(screen.queryByLabelText('시간')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startTime: '09:30', title: '오사카성 공원' }));
  });

  it('새 일정은 시간 없이 저장한다', async () => {
    const onSave = jest.fn();
    await wrap(
      <ScheduleSheet draft={{ ...imported, id: undefined, startTime: '', title: '' }} days={days} pkg onClose={jest.fn()} onSave={onSave} />,
    );

    await fireEvent.changeText(screen.getByLabelText('일정 이름'), '시부야');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startTime: '', title: '시부야' }));
  });
});
