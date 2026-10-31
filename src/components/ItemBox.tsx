import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { colors, memberColor } from '@/theme/tokens';

import type { AvatarPerson } from './AvatarStack';
import { Badge } from './Badge';

export type BoxPerson = AvatarPerson & { on: boolean };

type Props = {
  nameOriginal: string;
  nameKo: string;
  quantity: number;
  amountLabel: string; // 원본 금액 표시("¥2,000")
  krwLabel: string | null; // 원화(미리보기 또는 확정) "18,250원"
  needsReview: boolean;
  people: BoxPerson[]; // 대상 인원 + 지정 여부(아무도 on이 아니면 전원)
  splitLabel: string; // "2명 · 1인 5,460원" | "전원 1/N"
  // 편집 모드(없으면 읽기 전용)
  amountText?: string; // 원본 금액 입력 초깃값
  onChangeName?: (v: string) => void;
  onChangeAmount?: (v: string) => void;
  onToggle?: (memberId: string) => void;
  onAssign?: () => void; // 칩이 한 줄에 다 안 들어가면 사람 지정 시트로
  onClearReview?: () => void;
  onSplit?: () => void;
};

// 시안 7 품목 박스: 흰색 radius 20, 확인필요면 1.5 warning-line 테두리. 금액 해석은 화면이 lib로 한다.
export function ItemBox(p: Props) {
  const [amount, setAmount] = useState(p.amountText ?? '');
  const editable = !!p.onChangeName;
  return (
    <View className={`gap-3 rounded-card border-[1.5px] bg-white p-4 ${p.needsReview ? 'border-warning-line' : 'border-transparent'}`}>
      <View className="flex-row justify-between gap-2.5">
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            {editable ? (
              <TextInput
                value={p.nameKo}
                onChangeText={p.onChangeName}
                placeholder="품목 이름"
                placeholderTextColor={colors.ink[300]}
                accessibilityLabel="품목 이름"
                className="flex-shrink p-0 font-bold text-base text-ink"
              />
            ) : (
              <Text className="flex-shrink font-bold text-base text-ink">{p.nameKo || p.nameOriginal || '품목'}</Text>
            )}
            {p.needsReview && <Badge kind="review" onPress={p.onClearReview} accessibilityLabel={p.onClearReview ? '확인 필요 해제' : undefined} />}
          </View>
          {!!p.nameOriginal && <Text className="text-xs text-ink-400">{p.nameOriginal}</Text>}
        </View>
        <View className="items-end gap-0.5">
          <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-base text-ink">
            {p.krwLabel ?? p.amountLabel}
          </Text>
          {editable ? (
            <View className="flex-row items-center gap-1">
              {p.quantity !== 1 && <Text className="text-xs text-ink-400">{p.quantity} ×</Text>}
              <TextInput
                value={amount}
                onChangeText={(v) => {
                  setAmount(v);
                  p.onChangeAmount?.(v);
                }}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="품목 금액"
                style={{ fontVariant: ['tabular-nums'] }}
                className="h-7 min-w-16 rounded-badge bg-app px-2 py-0 text-right text-[13px] text-ink-500 focus:bg-sky-50"
              />
            </View>
          ) : (
            p.krwLabel && (
              <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs text-ink-400">
                {p.quantity !== 1 ? `${p.quantity} × ` : ''}
                {p.amountLabel}
              </Text>
            )
          )}
        </View>
      </View>

      <View className="flex-row items-center justify-between gap-2">
        {p.onAssign ? (
          <Pressable accessibilityRole="button" accessibilityLabel="사람 지정" onPress={p.onAssign} className="h-[34px] justify-center rounded-full border-[1.5px] border-line px-3">
            <Text className="font-bold text-[13px] text-ink-500">사람 지정</Text>
          </Pressable>
        ) : (
          <View className="flex-1 flex-row flex-wrap gap-1.5">
            {p.people.map((m) => {
              const c = memberColor(m.colorIndex);
              return (
                <Pressable
                  key={m.id}
                  disabled={!p.onToggle}
                  onPress={() => p.onToggle?.(m.id)}
                  accessibilityRole={p.onToggle ? 'checkbox' : 'text'}
                  accessibilityState={{ checked: m.on }}
                  accessibilityLabel={m.guest ? `${m.name}(게스트)` : m.name}
                  style={{ borderColor: m.on ? c.fg : colors.line.DEFAULT, backgroundColor: m.on ? c.tint : '#FFFFFF', borderStyle: m.guest ? 'dashed' : 'solid' }}
                  className="h-[34px] justify-center rounded-full border-[1.5px] px-[11px]"
                >
                  <Text style={{ color: m.on ? c.fg : colors.ink[300] }} className="font-bold text-[13px]">
                    {m.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View className="items-end gap-1">
          <Text className="text-right font-semibold text-xs text-ink-500">{p.splitLabel}</Text>
          {p.onSplit && (
            <Pressable accessibilityRole="button" onPress={p.onSplit} hitSlop={8}>
              <Text className="font-semibold text-xs text-primary-text">쪼개기</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
