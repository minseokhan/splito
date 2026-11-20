import { GitMerge, NavArrowDown, NavArrowUp, Scissor, Xmark } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { colors, memberColor } from '@/theme/tokens';

import type { AvatarPerson } from './AvatarStack';
import { Badge } from './Badge';
import { Icon } from './Icon';

export type BoxPerson = AvatarPerson & { on: boolean };

type Props = {
  nameOriginal: string;
  nameKo: string;
  quantity: number;
  amountLabel: string; // 현지 통화 금액("¥2,180")
  krwLabel: string | null; // 원화(미리보기 또는 확정) "19,840원"
  needsReview: boolean;
  people: BoxPerson[]; // 고를 수 있는 사람 + 지정 여부(아무도 on이 아니면 전원)
  splitLabel: string; // "전원 4명 · 1인 4,960원" | "2명 · 1인 5,460원"
  isKrw?: boolean; // 원화 지출이면 현지 통화 = 원화라 한 줄만 보여준다
  // 사람 선택 펼침(한 번에 한 카드만 — 화면이 정한다)
  expanded?: boolean;
  onToggleOpen?: () => void;
  // 편집 모드(없으면 읽기 전용). 이름·금액은 글자를 눌러 고친다.
  amountText?: string; // 현지 통화 금액 입력 초깃값
  onChangeName?: (v: string) => void;
  onChangeAmount?: (v: string) => void;
  onToggle?: (memberId: string) => void;
  onClearReview?: () => void;
  onSplit?: () => void; // 수량 2 이상일 때만 [쪼개기]
  onMerge?: () => void; // 쪼갠 장이면 [합치기]
  onRemove?: () => void; // 주면 우상단에 ⓧ 배지
};

const TABULAR = { fontVariant: ['tabular-nums' as const] };

// 시안 splito-split-handoff 품목 카드: 흰색 radius 20, 확인필요면 1.5 warning-line 테두리.
export function ItemBox(p: Props) {
  const [amount, setAmount] = useState(p.amountText ?? '');
  const editable = !!p.onChangeName;
  const mainCls = p.isKrw ? 'text-ink' : 'text-local';
  const mainLabel = p.isKrw ? (p.krwLabel ?? p.amountLabel) : p.amountLabel;
  const qty = p.quantity > 1 ? ` ×${p.quantity}` : '';
  // 지정이 없으면 전원이 먹은 것으로 보여준다(칩도 전원 켜짐).
  const allOff = !p.people.some((m) => m.on);
  const selected = allOff ? p.people : p.people.filter((m) => m.on);
  const pick = !!p.onToggle;
  const open = !!p.expanded;

  return (
    <View
      className={`gap-3 rounded-card border-[1.5px] bg-white p-4 ${p.needsReview ? 'border-warning-line' : 'border-transparent'}`}
    >
      {p.onRemove && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이 품목 삭제"
          onPress={p.onRemove}
          // 24px 원이라 hitSlop 10으로 터치 영역을 44 이상으로 맞춘다.
          hitSlop={10}
          style={{ boxShadow: '0 2px 6px -2px rgba(14,27,61,.18)' }}
          className="absolute -right-2 -top-2 z-10 h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-line bg-white"
        >
          <Icon as={Xmark} size={14} color={colors.ink[400]} />
        </Pressable>
      )}
      <View className="flex-row justify-between gap-2.5">
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            {editable ? (
              <View className="flex-shrink flex-row items-center">
                <TextInput
                  value={p.nameKo}
                  onChangeText={p.onChangeName}
                  placeholder="품목 이름"
                  placeholderTextColor={colors.ink[300]}
                  accessibilityLabel="품목 이름"
                  className="flex-shrink p-0 font-semibold text-base text-ink"
                />
                {!!qty && <Text className="font-semibold text-base text-ink">{qty}</Text>}
              </View>
            ) : (
              <Text className="flex-shrink font-semibold text-base text-ink">{(p.nameKo || p.nameOriginal || '품목') + qty}</Text>
            )}
            {p.needsReview && <Badge kind="review" onPress={p.onClearReview} accessibilityLabel={p.onClearReview ? '확인 필요 해제' : undefined} />}
          </View>
          {!!p.nameOriginal && <Text className="text-xs text-ink-400">{p.nameOriginal + qty}</Text>}
        </View>
        <View className="items-end gap-0.5">
          {editable ? (
            <TextInput
              value={amount}
              onChangeText={(v) => {
                setAmount(v);
                p.onChangeAmount?.(v);
              }}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="품목 금액"
              style={TABULAR}
              className={`min-w-[56px] p-0 text-right font-semibold text-[18px] leading-[23px] focus:bg-sky-50 ${mainCls}`}
            />
          ) : (
            <Text style={TABULAR} className={`font-semibold text-[18px] leading-[23px] ${mainCls}`}>
              {mainLabel}
            </Text>
          )}
          {!p.isKrw && !!p.krwLabel && (
            <Text style={TABULAR} className="text-[13px] text-ink-300">
              {p.krwLabel}
            </Text>
          )}
        </View>
      </View>

      {p.people.length > 0 && (
        <View className="gap-2.5 border-t border-muted pt-3">
          <Pressable
            disabled={!p.onToggleOpen}
            onPress={p.onToggleOpen}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={pick ? '먹은 사람 고르기' : '먹은 사람 보기'}
            className="flex-row items-center gap-2"
          >
            <View className="flex-row">
              {selected.map((m, i) => (
                <View
                  key={m.id}
                  style={{ marginLeft: i ? -8 : 0, backgroundColor: memberColor(m.colorIndex).fg }}
                  className="h-7 w-7 items-center justify-center rounded-full border-2 border-white"
                >
                  <Text className="font-semibold text-xs text-white">{m.name.slice(0, 1)}</Text>
                </View>
              ))}
            </View>
            <Text className="min-w-0 flex-1 font-semibold text-[13px] text-ink-700">{p.splitLabel}</Text>
            {p.onMerge ? (
              <Pressable accessibilityRole="button" onPress={p.onMerge} hitSlop={8} className="flex-row items-center gap-[3px] pr-1">
                <Icon as={GitMerge} size={15} color={colors.primary.text} />
                <Text className="font-semibold text-xs text-primary-text">합치기</Text>
              </Pressable>
            ) : (
              p.onSplit &&
              p.quantity > 1 && (
                <Pressable accessibilityRole="button" onPress={p.onSplit} hitSlop={8} className="flex-row items-center gap-[3px] pr-1">
                  <Icon as={Scissor} size={15} color={colors.primary.text} />
                  <Text className="font-semibold text-xs text-primary-text">쪼개기</Text>
                </Pressable>
              )
            )}
            {!!p.onToggleOpen && <Icon as={open ? NavArrowUp : NavArrowDown} size={18} color={colors.ink[400]} />}
          </Pressable>
          {open && (
            <View className="flex-row flex-wrap gap-1.5">
              {p.people.map((m) => {
                const c = memberColor(m.colorIndex);
                const on = allOff || m.on;
                return (
                  <Pressable
                    key={m.id}
                    disabled={!pick}
                    onPress={() => p.onToggle?.(m.id)}
                    accessibilityRole={pick ? 'checkbox' : 'text'}
                    accessibilityState={pick ? { checked: on } : undefined}
                    accessibilityLabel={m.guest ? `${m.name}(게스트)` : m.name}
                    style={{
                      backgroundColor: on ? c.tint : '#FFFFFF',
                      borderColor: on ? c.tint : colors['card-line'],
                      borderStyle: m.guest ? 'dashed' : 'solid',
                    }}
                    className="h-[34px] flex-row items-center gap-1.5 rounded-full border-[1.5px] pl-[3px] pr-[11px]"
                  >
                    <View
                      style={{ backgroundColor: on ? c.fg : colors.muted }}
                      className="h-[26px] w-[26px] items-center justify-center rounded-full"
                    >
                      <Text style={{ color: on ? '#FFFFFF' : colors.ink[300] }} className="font-semibold text-xs">
                        {m.name.slice(0, 1)}
                      </Text>
                    </View>
                    <Text style={{ color: on ? c.fg : colors.ink[300] }} className="font-semibold text-[13px]">
                      {m.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
