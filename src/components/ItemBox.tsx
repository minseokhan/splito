import { Check, NavArrowRight } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, memberColor } from '@/theme/tokens';

import type { AvatarPerson } from './AvatarStack';
import { Badge } from './Badge';
import { Icon } from './Icon';

export type BoxPerson = AvatarPerson & { on: boolean };

type Props = {
  nameOriginal: string;
  nameKo: string;
  quantity: number;
  amountLabel: string; // 현지 통화 금액("¥2,000")
  krwLabel: string | null; // 원화(미리보기 또는 확정) "18,250원"
  needsReview: boolean;
  people: BoxPerson[]; // 고를 수 있는 사람 + 지정 여부(아무도 on이 아니면 전원)
  splitLabel: string; // "2명 · 1인 5,460원" | "전원 1/N"
  isKrw?: boolean; // 원화 지출이면 현지 통화 = 원화라 한 줄만 보여준다
  // 사람 선택 펼침. 편집 모드에서만 의미가 있다(처음엔 펼쳐두고, 체크를 누르면 접힌다).
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  // 편집 모드(없으면 읽기 전용)
  amountText?: string; // 현지 통화 금액 입력 초깃값
  onChangeName?: (v: string) => void;
  onChangeAmount?: (v: string) => void;
  onToggle?: (memberId: string) => void;
  onClearReview?: () => void;
  onSplit?: () => void;
};

const TABULAR = { fontVariant: ['tabular-nums' as const] };

// 시안 7 품목 박스: 흰색 radius 20, 확인필요면 1.5 warning-line 테두리. 금액 해석은 화면이 lib로 한다.
export function ItemBox(p: Props) {
  const [amount, setAmount] = useState(p.amountText ?? '');
  const editable = !!p.onChangeName;
  const mainCls = p.isKrw ? 'text-ink' : 'text-local';
  const mainLabel = p.isKrw ? (p.krwLabel ?? p.amountLabel) : p.amountLabel;
  // 지정이 없으면 전원이 먹은 것으로 보여준다.
  const selected = p.people.some((m) => m.on) ? p.people.filter((m) => m.on) : p.people;
  // 펼침은 고를 수 있을 때만. 읽기 전용은 접힌 모양으로 먹은 사람만 보여준다.
  const open = !!p.onToggle && p.expanded !== false;

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
                className="flex-shrink p-0 font-semibold text-[17px] text-ink"
              />
            ) : (
              <Text className="flex-shrink font-semibold text-[17px] text-ink">{p.nameKo || p.nameOriginal || '품목'}</Text>
            )}
            {p.needsReview && <Badge kind="review" onPress={p.onClearReview} accessibilityLabel={p.onClearReview ? '확인 필요 해제' : undefined} />}
          </View>
          {!!p.nameOriginal && <Text className="text-[13px] text-ink-400">{p.nameOriginal}</Text>}
        </View>
        <View className="items-end gap-0.5">
          {editable ? (
            <View className="flex-row items-baseline gap-1">
              {p.quantity !== 1 && (
                <Text className="rounded-badge bg-muted px-1.5 py-0.5 font-semibold text-[15px] text-ink-500">{p.quantity} ×</Text>
              )}
              <TextInput
                value={amount}
                onChangeText={(v) => {
                  setAmount(v);
                  p.onChangeAmount?.(v);
                }}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="품목 금액"
                style={TABULAR}
                className={`min-w-20 rounded-badge px-1 py-0 text-right font-semibold text-[22px] focus:bg-sky-50 ${mainCls}`}
              />
            </View>
          ) : (
            <View className="flex-row items-baseline gap-1">
              {p.quantity !== 1 && (
                <Text className="rounded-badge bg-muted px-1.5 py-0.5 font-semibold text-[15px] text-ink-500">{p.quantity} ×</Text>
              )}
              <Text style={TABULAR} className={`font-semibold text-[22px] ${mainCls}`}>
                {mainLabel}
              </Text>
            </View>
          )}
          {!p.isKrw && !!p.krwLabel && (
            <Text style={TABULAR} className="text-sm text-ink-300">
              {p.krwLabel}
            </Text>
          )}
        </View>
      </View>

      <View className="flex-row items-center justify-between gap-2">
        {p.people.length > 0 &&
          (open ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 1 }}
              className="rounded-full bg-app"
              contentContainerClassName="flex-row items-center gap-1.5 p-0.5"
            >
              {p.people.map((m) => {
                const c = memberColor(m.colorIndex);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => p.onToggle?.(m.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: m.on }}
                    accessibilityLabel={m.guest ? `${m.name}(게스트)` : m.name}
                    style={{
                      borderColor: m.on ? c.fg : colors.line.DEFAULT,
                      backgroundColor: m.on ? c.tint : '#FFFFFF',
                      borderStyle: m.guest ? 'dashed' : 'solid',
                    }}
                    className="h-9 w-9 items-center justify-center rounded-full border-2"
                  >
                    <Text style={{ color: m.on ? c.fg : colors.ink[300] }} className="font-semibold text-[15px]">
                      {m.name.slice(0, 1)}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="사람 선택 닫기"
                onPress={p.onCollapse}
                className="h-9 w-9 items-center justify-center rounded-full bg-ink"
              >
                <Icon as={Check} size={18} color="#FFFFFF" />
              </Pressable>
            </ScrollView>
          ) : (
            <Pressable
              disabled={!p.onExpand}
              onPress={p.onExpand}
              accessibilityRole={p.onExpand ? 'button' : 'text'}
              accessibilityLabel="먹은 사람 고르기"
              className="flex-row items-center gap-1.5 self-start rounded-full bg-app py-0.5 pl-0.5 pr-2.5"
            >
              {selected.slice(0, 1).map((m) => {
                const c = memberColor(m.colorIndex);
                return (
                  <View
                    key={m.id}
                    style={{ backgroundColor: c.tint, borderStyle: m.guest ? 'dashed' : 'solid' }}
                    className="h-9 w-9 items-center justify-center rounded-full border-2 border-white"
                  >
                    <Text style={{ color: c.fg }} className="font-semibold text-[15px]">
                      {m.name.slice(0, 1)}
                    </Text>
                  </View>
                );
              })}
              {selected.length > 1 && <Text className="font-semibold text-sm text-ink-500">+{selected.length - 1}</Text>}
              {!!p.onExpand && <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />}
            </Pressable>
          ))}
        <View className="ml-auto items-end gap-1">
          <Text className="text-right font-semibold text-[13px] text-ink-500">{p.splitLabel}</Text>
          {p.onSplit && (
            <Pressable accessibilityRole="button" onPress={p.onSplit} hitSlop={8}>
              <Text className="font-semibold text-[13px] text-primary-text">쪼개기</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
