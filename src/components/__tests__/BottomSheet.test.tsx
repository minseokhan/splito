import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const sheet = (visible: boolean) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <BottomSheet visible={visible} onClose={jest.fn()}>
      <Text>멤버</Text>
    </BottomSheet>
  </SafeAreaProvider>
);

describe('BottomSheet 스크림', () => {
  // 시트가 내려가는 동안 Modal이 남아 있는지는 reanimated가 모킹돼 있어 여기서 못 본다(실기기 확인).
  it('스크림은 visible을 그대로 따라간다(애니메이션 없이)', async () => {
    const { rerender } = await render(sheet(false));
    expect(screen.queryByLabelText('닫기')).toBeNull();

    await rerender(sheet(true));
    expect(screen.getByLabelText('닫기')).toBeOnTheScreen();
    expect(screen.getByText('멤버')).toBeOnTheScreen();

    await rerender(sheet(false));
    expect(screen.queryByLabelText('닫기')).toBeNull();
  });
});
