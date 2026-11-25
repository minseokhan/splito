import { GitMerge, Group, NavArrowDown, NavArrowUp, Scissor, Trash } from 'iconoir-react-native';
import { useState, type ComponentType } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import { formatAmountInput } from '@/lib/expenseForm';
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
  /** 지출 상세: 이름·금액은 글자로만 보이고, 펼치면 사람 고르기만 한다. */
  readOnly?: boolean;
  onChangeName?: (v: string) => void;
  onChangeAmount?: (v: string) => void;
  onClearReview?: () => void;
  onSplit?: () => void;
  onMerge?: () => void;
  onRemove?: () => void;
};

const TABULAR = { fontVariant: ['tabular-nums' as const] };

// 영수증 티켓 안 품목 한 줄(18번 ④). 접힘: 이름·금액 두 줄. 펼침(37번): 맨 위 품목명·금액 입력칸 → 사람 고르기 → 쪼개기/합치기·삭제.
export function ItemRow(p: Props) {
  const [amount, setAmount] = useState(() => formatAmountInput(p.amountText));
  const open = p.expanded;
  const editing = open && !p.readOnly;
  const qty = p.quantity > 1 ? ` ×${p.quantity}` : '';
  // 비어 있으면 회색 안내 글자(28번 UX 라이팅). 금액 입력값이 비면 금액도 안내 글자.
  const name = p.nameKo || p.nameOriginal || '품목명을 입력해 주세요';
  const unnamed = !p.nameKo && !p.nameOriginal;
  const noAmount = !p.amountText;
  const mainCls = p.isKrw ? 'text-ink' : 'text-local';
  const mainLabel = p.isKrw ? (p.krwLabel ?? p.amountLabel) : p.amountLabel;
  // 금액 입력칸에도 통화 기호를 붙여 둔다(¥·$ 등은 왼쪽, 원화는 오른쪽 '원'). 기호는 amountLabel 앞부분이다.
  const prefix = p.isKrw ? '' : (/^-?(\D*)/.exec(p.amountLabel)?.[1] ?? '');
  // 지정이 없으면 전원
  const allOn = !p.people.some((m) => m.on);
  const selected = allOn ? p.people : p.people.filter((m) => m.on);

  return (
    // 펼친 줄은 왼쪽 막대(시안 openBar). 바탕은 흰색 — 입력칸이 연회색 채움이다(시안 rowBg #fff).
    <View className={open && p.readOnly ? 'bg-app' : 'bg-white'}>
      {!p.first && <View className="mx-5 h-px bg-muted" />}
      {open && <View className="absolute bottom-0 left-0 top-0 w-0.5 bg-primary-text" />}
      <Pressable
        onPress={p.onToggleOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${name} 품목`}
        className="min-h-[60px] flex-row items-center gap-2 py-2.5 pl-3.5 pr-5"
      >
        <Icon as={open ? NavArrowUp : NavArrowDown} size={16} color={open ? colors.primary.text : colors.ink[300]} />
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-shrink flex-row items-center gap-1.5">
              <Text numberOfLines={1} className={`flex-shrink font-semibold text-15 ${unnamed ? 'text-ink-400' : 'text-ink'}`}>
                {name}
              </Text>
              {!!qty && <Text className="font-semibold text-15 text-ink">{qty}</Text>}
              {p.needsReview && <Badge kind="review" onPress={p.onClearReview} accessibilityLabel="확인 필요 해제" />}
            </View>
            <Text style={TABULAR} className={`font-semibold text-15 ${noAmount ? 'text-ink-400' : mainCls}`}>
              {noAmount ? '금액을 입력해 주세요' : mainLabel}
            </Text>
          </View>
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              {!!p.nameOriginal && (
                <Text numberOfLines={open ? undefined : 1} className="flex-shrink text-xs text-ink-500">
                  {p.nameOriginal + qty}
                </Text>
              )}
              {!!p.nameOriginal && p.people.length > 0 && <Text className="text-xs text-line-off">·</Text>}
              {/* 전원이면 글자만, 일부만 고르면 겹친 아바타 + 진한 글자(손댄 품목이 눈에 띄게). 펼치면 아바타는 숨긴다. */}
              {p.people.length > 0 && !open && !allOn && <AvatarStack people={selected} size={20} ring="#FFFFFF" />}
              {p.people.length > 0 && (
                <Text className={`text-xs ${allOn ? 'text-ink-500' : 'font-semibold text-ink-700'}`}>{p.splitLabel}</Text>
              )}
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
        <View className="gap-3 pb-3.5 pl-[38px] pr-5 pt-0.5">
          {editing && (
            <View className="flex-row gap-2">
              <TextInput
                value={p.nameKo}
                onChangeText={p.onChangeName}
                placeholder="품목명을 입력해 주세요"
                placeholderTextColor={colors.ink[300]}
                accessibilityLabel="품목 이름"
                className={`flex-1 ${INPUT_CLS}`}
              />
              <View className="w-[120px] justify-center">
                <TextInput
                  value={amount}
                  onChangeText={(v) => {
                    const t = formatAmountInput(v);
                    setAmount(t);
                    p.onChangeAmount?.(t);
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.ink[300]}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel="품목 금액"
                  style={TABULAR}
                  className={`w-full ${INPUT_CLS} text-right ${prefix ? 'pl-7' : ''} ${p.isKrw ? 'pr-7' : ''}`}
                />
                {!!prefix && <Text pointerEvents="none" className="absolute left-3 text-sm text-ink-500">{prefix}</Text>}
                {p.isKrw && <Text pointerEvents="none" className="absolute right-3 text-sm text-ink-500">원</Text>}
              </View>
            </View>
          )}
          {p.people.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
              <Pressable accessibilityRole="button" accessibilityLabel="전원" onPress={p.onAll} className="items-center gap-1">
                <View className="h-9 w-9 items-center justify-center rounded-full border border-primary-text bg-white">
                  <Icon as={Group} size={18} color={colors.primary.text} />
                </View>
                <Text className="font-semibold text-11 text-ink">전원</Text>
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
                    className="w-10 items-center gap-1"
                  >
                    <View
                      style={{
                        backgroundColor: on ? memberColor(m.colorIndex).fg : '#FFFFFF',
                        borderColor: on ? memberColor(m.colorIndex).fg : colors.line.DEFAULT,
                        borderStyle: m.guest ? 'dashed' : 'solid',
                      }}
                      className="h-9 w-9 items-center justify-center rounded-full border"
                    >
                      <Text className={`font-semibold text-13 ${on ? 'text-white' : 'text-ink-300'}`}>{m.name.slice(0, 1)}</Text>
                    </View>
                    <Text numberOfLines={1} className="text-11 text-ink-500">
                      {m.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View className="h-8 flex-row items-center gap-4">
            {p.onMerge ? (
              <RowButton label="합치기" icon={GitMerge} onPress={p.onMerge} />
            ) : (
              !!p.onSplit && p.quantity > 1 && <RowButton label="쪼개기" icon={Scissor} onPress={p.onSplit} />
            )}
            {!!p.onRemove && (
              <View className="ml-auto">
                <RowButton label="삭제" icon={Trash} danger onPress={p.onRemove} />
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// 음성으로 기록과 같은 입력칸(37번): 44px·radius 12·#F8F9FB 채움·테두리 없음, 포커스 시 안쪽 1.5px primary-text.
const INPUT_CLS = 'h-11 rounded-input border-[1.5px] border-transparent bg-app px-3 py-0 font-semibold text-input-15 text-ink focus:border-primary-text';

// 13px 텍스트 버튼(아이콘 15). 테두리·배경 없음.
function RowButton({ label, icon, onPress, danger }: { label: string; icon: ComponentType<SvgProps>; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      className="h-8 flex-row items-center gap-[3px] active:opacity-60"
    >
      <Icon as={icon} size={15} color={danger ? colors.danger.DEFAULT : colors.primary.text} />
      <Text className={`font-semibold text-13 ${danger ? 'text-danger' : 'text-primary-text'}`}>{label}</Text>
    </Pressable>
  );
}
