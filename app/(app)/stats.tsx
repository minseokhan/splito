import { StatsUpSquare } from 'iconoir-react-native';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';

// 시안 18 — 기능 없는 '준비 중' 탭. 안내 문구만 둔다.
export default function Stats() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <Text className="px-5 pt-2.5 font-semibold text-2xl text-ink">통계</Text>
      <View className="flex-1 items-center justify-center gap-2">
        <View className="h-16 w-16 items-center justify-center rounded-[20px] bg-sky-100">
          <Icon as={StatsUpSquare} size={30} color={colors.primary.text} />
        </View>
        <Text className="mt-2 font-semibold text-lg text-ink">통계 화면을 준비 중이에요</Text>
        <Text className="text-sm text-ink-400">곧 여행별 지출을 한눈에 볼 수 있어요</Text>
      </View>
    </SafeAreaView>
  );
}
