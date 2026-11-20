import { InfoCircle, Plus } from 'iconoir-react-native';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';

type Day = { key: string; dayIndex: number; label: string; sub: string };

type Props = {
  /** 여행 기간 날짜만(여행 전 제외). */
  days: Day[];
  onAddSchedule: (dayIndex: number) => void;
  /** 날짜 탭 바로가기용: 날짜 줄의 y(이 컴포넌트 기준)와 높이. */
  onDayLayout: (key: string, y: number, height: number) => void;
};

// 일정표 첫 화면 — 일정·지출이 0건인 자유여행 방(노션 16번).
export function ScheduleEmpty({ days, onAddSchedule, onDayLayout }: Props) {
  // 줄의 y는 카드 기준이라 카드 자신의 y를 더해 넘긴다. 카드가 줄보다 먼저 배치된다고 기대하지 않도록 둘 다 다시 알린다.
  const cardY = useRef(0);
  const rows = useRef(new Map<string, { y: number; h: number }>());
  const report = () => rows.current.forEach((r, k) => onDayLayout(k, cardY.current + r.y, r.h));
  return (
    <View className="gap-3 px-5">
      {/* 원본 1a: 그림 없이 제목·설명만(위 20 · 좌우 12 · 아래 8) */}
      <View className="items-center gap-2 px-3 pb-2 pt-5">
        <Text className="mt-1 font-semibold text-lg text-ink">여행 일정을 만들어 보세요</Text>
        <Text className="text-center text-sm text-ink-500">{'날짜별로 일정을 적어 두면\n지출이 일정별로 정리돼요'}</Text>
      </View>
      <View
        className="rounded-box border border-card-line bg-white py-1.5"
        onLayout={(e) => {
          cardY.current = e.nativeEvent.layout.y;
          report();
        }}
      >
        {days.map((d) => (
          <Pressable
            key={d.key}
            accessibilityRole="button"
            accessibilityLabel={`${d.label} 일정 추가`}
            onPress={() => onAddSchedule(d.dayIndex)}
            onLayout={(e) => {
              rows.current.set(d.key, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height });
              report();
            }}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-app"
          >
            <View className="h-2.5 w-2.5 rounded-full bg-white" style={{ borderWidth: 2, borderColor: colors.line.off }} />
            <View className="min-w-0 flex-1 flex-row items-baseline gap-1.5">
              <Text className="font-semibold text-15 text-ink">{d.label}</Text>
              <Text className="text-13 text-ink-300">{d.sub}</Text>
            </View>
            <View className="flex-row items-center gap-[3px]">
              <Icon as={Plus} size={15} color={colors.primary.text} />
              <Text className="font-semibold text-13 text-primary-text">일정 추가</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View className="flex-row items-start gap-1.5 px-1 py-0.5">
        <View className="mt-0.5">
          <Icon as={InfoCircle} size={15} color={colors.ink[300]} />
        </View>
        <Text className="flex-1 text-xs text-ink-500">일정 없이도 아래 [지출 올리기]로 지출을 바로 올릴 수 있어요.</Text>
      </View>
    </View>
  );
}
