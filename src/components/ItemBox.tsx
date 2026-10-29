import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AvatarStack, type AvatarPerson } from './AvatarStack';
import { Badge } from './Badge';

type Props = {
  nameOriginal: string;
  nameKo: string;
  quantity: number;
  amountText: string; // 표시용 원본 금액(외화)
  krwPreview: string | null; // "29,925원" 미리보기
  needsReview: boolean;
  assignees: AvatarPerson[]; // 비면 "전원"
  showAssign: boolean;
  onChangeName: (v: string) => void;
  onChangeAmount: (v: string) => void; // 원본 금액 입력 문자열
  onAssign: () => void;
  onClearReview: () => void;
  onSplit: () => void;
};

// UI_GUIDE 품목 박스. 금액 입력은 문자열로 받고 해석은 화면이 lib로 한다.
export function ItemBox(p: Props) {
  const [amount, setAmount] = useState(p.amountText);
  return (
    <View className={`rounded-md border bg-white p-3 ${p.needsReview ? 'border-[#F0C14B]' : 'border-line'}`}>
      {p.needsReview && <Badge kind="review" onPress={p.onClearReview} accessibilityLabel="확인 필요 해제" />}
      {!!p.nameOriginal && <Text className="mt-1 text-sm text-ink-500">{p.nameOriginal}</Text>}
      <TextInput
        value={p.nameKo}
        onChangeText={p.onChangeName}
        placeholder="품목 이름"
        accessibilityLabel="품목 이름"
        className="font-semibold text-base text-ink-900"
      />
      <View className="mt-1 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1">
          {p.quantity !== 1 && <Text className="text-[15px] text-ink-700">{p.quantity} ×</Text>}
          <TextInput
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              p.onChangeAmount(v);
            }}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="품목 금액"
            style={{ fontVariant: ['tabular-nums'] }}
            className="h-11 min-w-24 rounded-lg border border-input-line px-3 text-base text-ink-900 focus:border-sky-800 focus:bg-sky-100"
          />
        </View>
        {p.showAssign && (
          <Pressable accessibilityRole="button" accessibilityLabel="사람 지정" onPress={p.onAssign} className="min-h-11 justify-center">
            {p.assignees.length ? (
              <AvatarStack people={p.assignees} />
            ) : (
              <View className="rounded-md bg-sky-100 px-2 py-1">
                <Text className="font-semibold text-xs text-sky-900">전원</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>
      {p.krwPreview && (
        <Text style={{ fontVariant: ['tabular-nums'] }} className="mt-1 text-[13px] text-ink-500">
          약 {p.krwPreview}
        </Text>
      )}
      <Pressable accessibilityRole="button" onPress={p.onSplit} className="h-11 justify-center self-start">
        <Text className="font-medium text-[15px] text-sky-900">쪼개기</Text>
      </Pressable>
    </View>
  );
}
