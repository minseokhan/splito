import { Calendar } from 'iconoir-react-native';
import { Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';

// 일정 카드의 [+ 지출]로 들어왔을 때 입력 화면 위에 붙는 안내(명세 §7).
export function ScheduleChip({ title }: { title: string }) {
  return (
    <View className="flex-row items-center gap-2 rounded-chip border border-sky-200 bg-sky-50 px-3 py-2.5">
      <Icon as={Calendar} size={16} color={colors.primary.text} />
      <Text className="flex-1 text-[13px] text-primary-on">
        저장하면 <Text className="font-semibold">{title}</Text> 일정에 연결돼요
      </Text>
    </View>
  );
}
