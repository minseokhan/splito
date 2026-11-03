import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { isValidScheduleTime, normalizeScheduleTime, type ScheduleItem } from '@/lib/schedule';
import { colors } from '@/theme/tokens';

// 명세 §6 포함 사항 목록. 순서도 시안 그대로다.
export const INCLUDE_OPTIONS = [
  '항공 포함',
  '숙박 포함',
  '조식 포함',
  '중식 포함',
  '석식 포함',
  '입장료 포함',
  '교통 포함',
  '가이드',
] as const;

export type ScheduleDraft = {
  id?: string;
  dayIndex: number;
  startTime: string;
  title: string;
  includes: string[];
  optional: boolean;
  estAmount: number;
};

type Props = {
  draft: ScheduleDraft | null;
  dayLabel: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: ScheduleDraft) => void;
  onDelete: (id: string) => void;
};

export const draftOf = (item: ScheduleItem): ScheduleDraft => ({
  id: item.id,
  dayIndex: item.dayIndex,
  startTime: item.startTime,
  title: item.title,
  includes: item.includes,
  optional: item.optional,
  estAmount: item.estAmount,
});

const withCommas = (n: number) => (n ? n.toLocaleString('ko-KR') : '');

function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="선택관광"
      onPress={onPress}
      className={`h-[26px] w-11 rounded-full p-[3px] ${on ? 'bg-ink' : 'bg-line-off'} ${on ? 'items-end' : 'items-start'}`}
    >
      <View className="h-5 w-5 rounded-full bg-white" style={{ boxShadow: '0 1px 3px rgba(19,25,39,.2)' }} />
    </Pressable>
  );
}

// 입력칸 초기값은 draft에서 온다. 시트를 다시 열면 key로 통째로 갈아 끼워 effect 없이 초기화한다.
export function ScheduleSheet({ draft, dayLabel, saving, onClose, onSave, onDelete }: Props) {
  return (
    <BottomSheet visible={!!draft} onClose={onClose}>
      {draft && (
        <Form
          key={draft.id ?? `new-${draft.dayIndex}`}
          draft={draft}
          dayLabel={dayLabel}
          saving={saving}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </BottomSheet>
  );
}

function Form({ draft, dayLabel, saving, onSave, onDelete }: Omit<Props, 'onClose' | 'draft'> & { draft: ScheduleDraft }) {
  const [time, setTime] = useState(draft.startTime);
  const [title, setTitle] = useState(draft.title);
  const [includes, setIncludes] = useState<string[]>(draft.includes);
  const [optional, setOptional] = useState(draft.optional);
  const [est, setEst] = useState(withCommas(draft.estAmount));

  const timeInvalid = time.length > 0 && !isValidScheduleTime(time);
  const canSave = isValidScheduleTime(time) && title.trim().length > 0;

  return (
    <View className="gap-4">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-semibold text-xl text-ink">{draft.id ? '일정 수정' : '일정 추가'}</Text>
          <Text className="text-[13px] text-ink-400">{dayLabel}</Text>
        </View>

        <View className="flex-row gap-2">
          <View className="w-24 gap-1.5">
            <Text className="font-semibold text-[13px] text-ink-500">시간</Text>
            <TextField
              value={time}
              onChangeText={setTime}
              onBlur={() => setTime((t) => normalizeScheduleTime(t))}
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
              invalid={timeInvalid}
              accessibilityLabel="시간"
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="font-semibold text-[13px] text-ink-500">일정 이름</Text>
            <TextField
              value={title}
              onChangeText={setTitle}
              placeholder="예: 오사카성 공원"
              maxLength={60}
              accessibilityLabel="일정 이름"
            />
          </View>
        </View>
        {timeInvalid && <Text className="text-[13px] text-danger">시간은 0:00~23:59로 적어주세요.</Text>}

        <View className="gap-2">
          <Text className="font-semibold text-[13px] text-ink-500">포함 사항</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {INCLUDE_OPTIONS.map((l) => {
              const on = includes.includes(l);
              return (
                <Pressable
                  key={l}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => setIncludes((v) => (on ? v.filter((x) => x !== l) : [...v, l]))}
                  className={`h-8 justify-center rounded-full px-3 ${on ? 'bg-sky-100' : 'bg-white'}`}
                  style={{ borderWidth: 1.5, borderColor: on ? colors.primary.DEFAULT : colors.line.DEFAULT }}
                >
                  <Text className={`font-semibold text-[13px] ${on ? 'text-primary-text' : 'text-ink-500'}`}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setOptional((v) => !v)}
          className="flex-row items-center justify-between rounded-input bg-app px-3.5 py-3"
        >
          <View>
            <Text className="font-semibold text-[15px] text-ink">선택관광</Text>
            <Text className="text-xs text-ink-400">현지에서 따로 결제하는 일정이에요</Text>
          </View>
          <Toggle on={optional} onPress={() => setOptional((v) => !v)} />
        </Pressable>

        {optional && (
          <View className="flex-row items-center gap-2.5">
            <Text className="flex-1 text-sm text-ink-500">예정 금액</Text>
            <View className="h-11 w-40 flex-row items-center gap-1 rounded-chip border-[1.5px] border-line px-3">
              <TextInput
                value={est}
                onChangeText={(t) => setEst(withCommas(Number(t.replace(/[^0-9]/g, '')) || 0))}
                placeholder="0"
                placeholderTextColor={colors.ink[300]}
                keyboardType="number-pad"
                accessibilityLabel="예정 금액"
                className="min-w-0 flex-1 text-right font-semibold text-[15px] text-ink"
              />
              <Text className="font-semibold text-[15px] text-ink">원</Text>
            </View>
          </View>
        )}

        <View className="flex-row gap-2">
          {!!draft.id && <PrimaryButton title="삭제" variant="danger" onPress={() => onDelete(draft.id!)} />}
          <PrimaryButton
            title="저장"
            variant="dark"
            grow
            loading={saving}
            disabled={!canSave}
            onPress={() =>
              onSave({
                ...draft,
                startTime: normalizeScheduleTime(time),
                title: title.trim(),
                includes,
                optional,
                estAmount: Number(est.replace(/[^0-9]/g, '')) || 0,
              })
            }
          />
        </View>
    </View>
  );
}
