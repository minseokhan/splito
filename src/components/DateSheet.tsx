import { NavArrowLeft, NavArrowRight } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { dateLabel, monthGrid, monthTitle, shiftMonth, WEEKDAYS } from '@/lib/calendar';
import { kstToday } from '@/lib/expenseForm';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';

// min·max는 고를 수 있는 범위(둘 다 포함). 주지 않으면 제한 없음 — 상한 규칙은 부르는 쪽이 갖는다.
type Props = {
  visible: boolean;
  value: string;
  onPick: (date: string) => void;
  onClose: () => void;
  title?: string;
  min?: string;
  max?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CELL = 'w-[14.28%]';

// 날짜 달력. 닫으면 Calendar가 풀려서 다음에 열 때 선택된 날의 달부터 다시 시작한다.
export function DateSheet({ visible, value, onPick, onClose, title = '결제일', min, max }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {visible && <Calendar value={value} onPick={onPick} min={min} max={max} />}
    </BottomSheet>
  );
}

// 월 그리드 하나 + 이전/다음 달. 범위 밖 날짜는 누를 수 없다.
function Calendar({ value, onPick, min, max }: Pick<Props, 'value' | 'onPick' | 'min' | 'max'>) {
  const today = kstToday(new Date());
  const blocked = (d: string) => (!!max && d > max) || (!!min && d < min);
  const [month, setMonth] = useState(() => (DATE_RE.test(value) ? value : today).slice(0, 7));

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={8} className="p-1">
          <Icon as={NavArrowLeft} size={22} />
        </Pressable>
        <Text className="font-semibold text-base text-ink">{monthTitle(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => setMonth(shiftMonth(month, 1))} hitSlop={8} className="p-1">
          <Icon as={NavArrowRight} size={22} />
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAYS.map((w) => (
          <Text key={w} className={`${CELL} text-center text-xs text-ink-400`}>
            {w}
          </Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {monthGrid(month).map((d, i) =>
          d === null ? (
            <View key={`blank${i}`} className={`h-11 ${CELL}`} />
          ) : (
            <Pressable
              key={d}
              disabled={blocked(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: d === value, disabled: blocked(d) }}
              accessibilityLabel={dateLabel(d)}
              onPress={() => onPick(d)}
              className={`h-11 ${CELL} items-center justify-center`}
            >
              <View className={`h-9 w-9 items-center justify-center rounded-full ${d === value ? 'bg-ink' : ''}`}>
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className={`font-semibold text-sm ${d === value ? 'text-white' : blocked(d) ? 'text-ink-300' : 'text-ink'}`}
                >
                  {Number(d.slice(8))}
                </Text>
              </View>
              {d === today && d !== value && <View className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}
