import { NavArrowLeft, NavArrowRight } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { dateLabel, monthGrid, monthTitle, shiftMonth, WEEKDAYS } from '@/lib/calendar';
import { kstToday } from '@/lib/expenseForm';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { PrimaryButton } from './PrimaryButton';

// min·max는 고를 수 있는 범위(둘 다 포함). 주지 않으면 제한 없음 — 상한 규칙은 부르는 쪽이 갖는다.
type Props = {
  visible: boolean;
  value: string;
  onPick: (date: string) => void;
  onClose: () => void;
  title?: string;
  min?: string;
  max?: string;
  // 아래 셋은 결제일 달력(18번 ⑥)용. resultLabel을 주면 날짜를 눌러도 바로 닫지 않고 결과 줄 + [선택]으로 확정한다.
  quick?: { label: string; date: string }[];
  band?: { start: string; end: string | null }; // 여행 기간 띠
  resultLabel?: (date: string) => string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CELL = 'w-[14.28%]';

// 날짜 달력. 닫으면 Calendar가 풀려서 다음에 열 때 선택된 날의 달부터 다시 시작한다.
export function DateSheet({ visible, onClose, title = '결제일', ...rest }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {visible && (rest.resultLabel ? <ConfirmCalendar {...rest} resultLabel={rest.resultLabel} /> : <Calendar {...rest} />)}
    </BottomSheet>
  );
}

type CalProps = Pick<Props, 'value' | 'onPick' | 'min' | 'max' | 'quick' | 'band'>;

// 빠른 선택 칩 + 달력 + 결과 줄 + [선택]. 확정 전까지는 고른 날을 들고만 있는다.
function ConfirmCalendar({ resultLabel, onPick, ...rest }: CalProps & { resultLabel: (d: string) => string }) {
  const [picked, setPicked] = useState(rest.value);
  const blocked = (d: string) => (!!rest.max && d > rest.max) || (!!rest.min && d < rest.min);
  return (
    <View className="gap-4">
      {!!rest.quick?.length && (
        <View className="flex-row gap-2">
          {rest.quick.map((q) => {
            const on = q.date === picked;
            return (
              <Pressable
                key={q.label}
                disabled={blocked(q.date)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setPicked(q.date)}
                className={`h-9 justify-center rounded-chip border px-3 ${on ? 'border-primary-text bg-sky-50' : 'border-line bg-white'}`}
              >
                <Text className={`font-semibold text-13 ${on ? 'text-primary-text' : 'text-ink-500'}`}>{q.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Calendar {...rest} value={picked} onPick={setPicked} />
      <View className="flex-row items-center justify-between gap-3 border-t border-muted pt-3">
        <Text style={{ fontVariant: ['tabular-nums'] }} className="flex-1 font-semibold text-15 text-ink">
          {DATE_RE.test(picked) ? resultLabel(picked) : ''}
        </Text>
        <PrimaryButton title="선택" size="md" disabled={!DATE_RE.test(picked)} onPress={() => onPick(picked)} />
      </View>
    </View>
  );
}

// 월 그리드 하나 + 이전/다음 달. 범위 밖 날짜는 누를 수 없다.
function Calendar({ value, onPick, min, max, band }: CalProps) {
  const today = kstToday(new Date());
  const blocked = (d: string) => (!!max && d > max) || (!!min && d < min);
  const [month, setMonth] = useState(() => (DATE_RE.test(value) ? value : today).slice(0, 7));
  const inBand = (d: string) => !!band && d >= band.start && (!band.end || d <= band.end);

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
              {inBand(d) && <View className="absolute inset-x-0 top-1 h-9 bg-sky-50" />}
              <View className={`h-9 w-9 items-center justify-center rounded-full ${d === value ? 'bg-ink' : ''}`}>
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className={`font-semibold text-sm ${d === value ? 'text-white' : blocked(d) ? 'text-line-off' : 'text-ink'}`}
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
