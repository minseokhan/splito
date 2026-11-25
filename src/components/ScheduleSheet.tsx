import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { ScheduleItem } from '@/lib/schedule';
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
  startTime: string; // '' = 시간 없음. 시트에서는 고치지 않는다(예약에서 불러온 시간만 있다, 노션 27번)
  position?: number; // 새 일정을 넣을 자리([위에/아래에 일정 추가]). 없으면 그날 맨 아래
  title: string;
  includes: string[];
  optional: boolean;
  estAmount: number;
};

type Props = {
  draft: ScheduleDraft | null;
  /** 날짜 칩(수정)·제목 옆 날짜 표시용. 여행 전은 넣지 않는다. */
  days: { dayIndex: number; label: string }[];
  /** 패키지 방: 수정에서 포함 사항·선택관광까지. 자유여행은 이름·날짜만. */
  pkg: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: ScheduleDraft) => void;
};

export const draftOf = (item: ScheduleItem): ScheduleDraft => ({
  id: item.id,
  dayIndex: item.dayIndex,
  startTime: item.startTime ?? '',
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
export function ScheduleSheet({ draft, onClose, ...rest }: Props) {
  return (
    <BottomSheet visible={!!draft} onClose={onClose}>
      {draft && <Form key={draft.id ?? `new-${draft.dayIndex}-${draft.position ?? 'end'}`} draft={draft} {...rest} />}
    </BottomSheet>
  );
}

// [+ 일정 추가]·위/아래에 추가는 이름만 받는다. 수정은 이름 / 날짜 칩 / (패키지) 포함 사항·선택관광(노션 9·27번).
// 시간 입력은 없다 — 예약에서 불러온 시간은 그대로 넘기고, 직접 추가한 일정은 시간 없이 둔다(노션 27번).
function Form({ draft, days, pkg, saving, onSave }: Omit<Props, 'onClose' | 'draft'> & { draft: ScheduleDraft }) {
  const editing = !!draft.id;
  const [dayIndex, setDayIndex] = useState(draft.dayIndex);
  const [title, setTitle] = useState(draft.title);
  const [focused, setFocused] = useState(false);
  const [includes, setIncludes] = useState<string[]>(draft.includes);
  const [optional, setOptional] = useState(draft.optional);
  const [est, setEst] = useState(withCommas(draft.estAmount));

  const canSave = title.trim().length > 0;
  const full = editing && pkg;

  return (
    <View className="gap-4">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-semibold text-xl text-ink">{editing ? '일정 수정' : '일정 추가'}</Text>
          {!editing && <Text className="text-13 text-ink-400">{days.find((d) => d.dayIndex === dayIndex)?.label ?? ''}</Text>}
        </View>

        <View className="gap-1.5">
          <Text className="font-semibold text-13 text-ink-500">일정 이름</Text>
          {/* 시안 높이 48 → 사용자 요청으로 52(2026-11-25) · 좌우 12 · 16px · 테두리 line, 포커스 primary-text. 공용 TextField(54·17px)보다 작다. */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="예: 오사카성 공원"
            placeholderTextColor={colors.ink[300]}
            maxLength={60}
            autoFocus={!editing}
            accessibilityLabel="일정 이름"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="h-[52px] rounded-input bg-white px-3 font-medium text-input-16 text-ink"
            style={{ borderWidth: 1, borderColor: focused ? colors.primary.text : colors.line.DEFAULT }}
          />
        </View>

        {editing && (
          <View className="gap-2">
            <Text className="font-semibold text-13 text-ink-500">날짜</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {days.map((d) => {
                const on = d.dayIndex === dayIndex;
                return (
                  <Pressable
                    key={d.dayIndex}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setDayIndex(d.dayIndex)}
                    // 시안: 높이 34 · 고른 칩은 테두리 없이 sky-100, 나머지는 흰 바탕 + 아주 옅은 테두리(line-row).
                    className={`h-[34px] justify-center rounded-full px-3 ${on ? 'bg-sky-100' : 'bg-white'}`}
                    style={{ borderWidth: 1, borderColor: on ? colors.sky[100] : colors.line.row }}
                  >
                    <Text className={`font-semibold text-13 ${on ? 'text-primary-text' : 'text-ink-500'}`}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {full && (
        <View className="gap-2">
          <Text className="font-semibold text-13 text-ink-500">포함 사항</Text>
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
                  style={{ borderWidth: 1, borderColor: on ? colors.primary.DEFAULT : colors.line.DEFAULT }}
                >
                  <Text className={`font-semibold text-13 ${on ? 'text-primary-text' : 'text-ink-500'}`}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        )}

        {full && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOptional((v) => !v)}
          className="flex-row items-center justify-between rounded-input bg-app px-3.5 py-3"
        >
          <View>
            <Text className="font-semibold text-15 text-ink">선택관광</Text>
            <Text className="text-xs text-ink-400">현지에서 따로 결제하는 일정이에요</Text>
          </View>
          <Toggle on={optional} onPress={() => setOptional((v) => !v)} />
        </Pressable>
        )}

        {full && optional && (
          <View className="flex-row items-center gap-2.5">
            <Text className="flex-1 text-sm text-ink-500">예정 금액</Text>
            <View className="h-11 w-40 flex-row items-center gap-1 rounded-chip border border-line px-3">
              <TextInput
                value={est}
                onChangeText={(t) => setEst(withCommas(Number(t.replace(/[^0-9]/g, '')) || 0))}
                placeholder="0"
                placeholderTextColor={colors.ink[300]}
                keyboardType="number-pad"
                accessibilityLabel="예정 금액"
                className="min-w-0 flex-1 text-right font-semibold text-input-15 text-ink"
              />
              <Text className="font-semibold text-15 text-ink">원</Text>
            </View>
          </View>
        )}

        <View className="flex-row gap-2">
          <PrimaryButton
            title="저장"
            grow
            loading={saving}
            disabled={!canSave}
            onPress={() =>
              onSave({
                ...draft,
                dayIndex,
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
