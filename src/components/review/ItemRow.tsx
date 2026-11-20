import { Group, NavArrowDown, NavArrowUp } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, memberColor } from '@/theme/tokens';

import { AvatarStack } from '../AvatarStack';
import { Badge } from '../Badge';
import type { BoxPerson } from '../ItemBox';
import { Icon } from '../Icon';

type Props = {
  first: boolean; // 첫 줄은 위 구분선이 없다
  nameOriginal: string;
  nameKo: string;
  quantity: number;
  amountText: string; // 결제 통화 금액 입력 초깃값
  amountLabel: string; // "¥2,180"
  krwLabel: string | null;
  isKrw: boolean;
  needsReview: boolean;
  expanded: boolean;
  onToggleOpen: () => void;
  people: BoxPerson[]; // 비어 있으면 사람 선택 없음(혼자인 여행)
  splitLabel: string;
  onToggle: (memberId: string) => void;
  onAll: () => void;
  onChangeName: (v: string) => void;
  onChangeAmount: (v: string) => void;
  onClearReview: () => void;
  onSplit?: () => void;
  onMerge?: () => void;
  onRemove?: () => void;
};

const TABULAR = { fontVariant: ['tabular-nums' as const] };

// 영수증 티켓 안 품목 한 줄(18번 ④). 접힘: 이름·금액 두 줄. 펼침: 이름·금액 입력 + 사람 고르기 + 쪼개기/합치기·삭제.
export function ItemRow(p: Props) {
  const [amount, setAmount] = useState(p.amountText);
  const open = p.expanded;
  const qty = p.quantity > 1 ? ` ×${p.quantity}` : '';
  const name = p.nameKo || p.nameOriginal || '품목';
  const mainCls = p.isKrw ? 'text-ink' : 'text-local';
  const mainLabel = p.isKrw ? (p.krwLabel ?? p.amountLabel) : p.amountLabel;
  // 지정이 없으면 전원
  const allOn = !p.people.some((m) => m.on);
  const selected = allOn ? p.people : p.people.filter((m) => m.on);

  return (
    <View className="bg-white">
      {!p.first && <View className="mx-5 h-px bg-muted" />}
      {open && <View className="absolute bottom-0 left-0 top-0 w-0.5 bg-primary-text" />}
      <Pressable
        onPress={p.onToggleOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${name} 품목`}
        className="flex-row gap-2 px-5 py-3.5"
      >
        <View className="pt-0.5">
          <Icon as={open ? NavArrowUp : NavArrowDown} size={16} color={open ? colors.primary.text : colors.ink[300]} />
        </View>
        <View className="flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-shrink flex-row items-center gap-1.5">
              {open ? (
                <TextInput
                  value={p.nameKo}
                  onChangeText={p.onChangeName}
                  placeholder="품목 이름"
                  placeholderTextColor={colors.ink[300]}
                  accessibilityLabel="품목 이름"
                  className="flex-shrink p-0 font-semibold text-[15px] text-ink"
                />
              ) : (
                <Text numberOfLines={1} className="flex-shrink font-semibold text-[15px] text-ink">
                  {name}
                </Text>
              )}
              {!!qty && <Text className="font-semibold text-[15px] text-ink">{qty}</Text>}
              {p.needsReview && <Badge kind="review" onPress={p.onClearReview} accessibilityLabel="확인 필요 해제" />}
            </View>
            {open ? (
              <TextInput
                value={amount}
                onChangeText={(v) => {
                  setAmount(v);
                  p.onChangeAmount(v);
                }}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="품목 금액"
                style={TABULAR}
                className={`min-w-[56px] p-0 text-right font-semibold text-[15px] focus:bg-sky-50 ${mainCls}`}
              />
            ) : (
              <Text style={TABULAR} className={`font-semibold text-[15px] ${mainCls}`}>
                {mainLabel}
              </Text>
            )}
          </View>
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              {!!p.nameOriginal && (
                <Text numberOfLines={1} className="flex-shrink text-xs text-ink-400">
                  {p.nameOriginal + qty}
                  {p.people.length > 0 ? ' ·' : ''}
                </Text>
              )}
              {p.people.length > 0 && !open && <AvatarStack people={selected} size={18} ring="#FFFFFF" />}
              {p.people.length > 0 && <Text className="text-xs text-ink-500">{p.splitLabel}</Text>}
            </View>
            {!p.isKrw && !!p.krwLabel && (
              <Text style={TABULAR} className="text-xs text-ink-300">
                {p.krwLabel}
              </Text>
            )}
          </View>
        </View>
      </Pressable>

      {open && (
        <View className="gap-3 pb-4 pl-[44px] pr-5">
          {p.people.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
              <Pressable accessibilityRole="button" accessibilityLabel="전원" onPress={p.onAll} className="items-center gap-1">
                <View className="h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-primary-text bg-white">
                  <Icon as={Group} size={18} color={colors.primary.text} />
                </View>
                <Text className="font-semibold text-[11px] text-primary-text">전원</Text>
              </Pressable>
              {p.people.map((m) => {
                const on = allOn || m.on;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => p.onToggle(m.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={m.guest ? `${m.name}(게스트)` : m.name}
                    style={{ opacity: on ? 1 : 0.4 }}
                    className="items-center gap-1"
                  >
                    <View
                      style={{
                        backgroundColor: on ? memberColor(m.colorIndex).fg : '#FFFFFF',
                        borderColor: on ? memberColor(m.colorIndex).fg : colors.line.DEFAULT,
                        borderStyle: m.guest ? 'dashed' : 'solid',
                      }}
                      className="h-9 w-9 items-center justify-center rounded-full border-[1.5px]"
                    >
                      <Text className={`font-semibold text-[13px] ${on ? 'text-white' : 'text-ink-300'}`}>{m.name.slice(0, 1)}</Text>
                    </View>
                    <Text numberOfLines={1} className="max-w-[44px] text-[11px] text-ink-500">
                      {m.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View className="flex-row gap-2">
            {p.onMerge ? (
              <RowButton label="합치기" onPress={p.onMerge} />
            ) : (
              !!p.onSplit && p.quantity > 1 && <RowButton label="쪼개기" onPress={p.onSplit} />
            )}
            {!!p.onRemove && <RowButton label="삭제" danger onPress={p.onRemove} />}
          </View>
        </View>
      )}
    </View>
  );
}

function RowButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-8 justify-center rounded-chip border-[1.5px] border-line bg-white px-3 active:bg-muted"
    >
      <Text className={`font-semibold text-[13px] ${danger ? 'text-danger' : 'text-ink-500'}`}>{label}</Text>
    </Pressable>
  );
}
