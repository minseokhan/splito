import { Check, InfoCircle, NavArrowDown, NavArrowUp, Search } from 'iconoir-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { BANKS, FAVORITE_BANK_COUNT, accountDigits, searchBanks } from '@/lib/bank';
import { colors } from '@/theme/tokens';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { TextField } from './TextField';

type Props = {
  visible: boolean;
  onClose: () => void;
  initialBankCode: string;
  saving: boolean;
  error?: string;
  onSubmit: (bankCode: string, accountNumber: string) => void;
};

// 받을 계좌 변경 시트(노션 34번). 계좌번호는 이 시트 상태에만 둔다 — 시트가 닫히면 본문이 언마운트돼 지워진다.
export function AccountChangeSheet({ visible, onClose, ...body }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="받을 계좌 변경">
      <Body {...body} />
    </BottomSheet>
  );
}

function SectionHead({ children, line }: { children: string; line?: boolean }) {
  return <Text className={`px-3.5 pb-1 pt-2.5 font-semibold text-xs text-ink-300 ${line ? 'border-t border-line-row' : ''}`}>{children}</Text>;
}

function Body({ initialBankCode, saving, error, onSubmit }: Omit<Props, 'visible' | 'onClose'>) {
  const [bankCode, setBankCode] = useState(initialBankCode);
  const [listOpen, setListOpen] = useState(false);
  const [q, setQ] = useState('');
  const [num, setNum] = useState('');
  const bank = BANKS.find((b) => b.code === bankCode);
  const list = searchBanks(q);
  const ok = !!bank && num.length >= 10;

  return (
    <>
      <View className="gap-2">
        <Text className="font-semibold text-13 text-ink-500">은행</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="은행 선택"
          accessibilityState={{ expanded: listOpen }}
          onPress={() => {
            setListOpen(!listOpen);
            setQ('');
          }}
          className="h-[52px] flex-row items-center gap-2.5 rounded-input border px-3.5"
          style={{ borderColor: listOpen ? colors.primary.text : colors.line.DEFAULT }}
        >
          <View className="h-7 w-7 items-center justify-center rounded-full bg-sky-50">
            <Text className="font-semibold text-xs text-primary-text">{bank?.name.charAt(0)}</Text>
          </View>
          <Text className="flex-1 font-semibold text-17 text-ink">{bank?.name}</Text>
          <Icon as={listOpen ? NavArrowUp : NavArrowDown} size={18} color={colors.ink[500]} />
        </Pressable>
        {listOpen && (
          <View className="overflow-hidden rounded-input border border-line">
            <View className="h-11 flex-row items-center gap-2 border-b border-line-row px-3">
              <Icon as={Search} size={16} color={colors.ink[300]} />
              <TextInput
                accessibilityLabel="은행 검색"
                value={q}
                onChangeText={setQ}
                placeholder="은행 이름 검색"
                placeholderTextColor={colors.ink[300]}
                className="h-full flex-1 text-input-15 text-ink"
              />
            </View>
            <ScrollView className="max-h-[220px]" nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {!q && <SectionHead>자주 쓰는 은행</SectionHead>}
              {list.map((b, i) => {
                const on = b.code === bankCode;
                return (
                  <View key={b.code}>
                    {!q && i === FAVORITE_BANK_COUNT && <SectionHead line>전체 은행</SectionHead>}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        setBankCode(b.code);
                        setListOpen(false);
                        setQ('');
                      }}
                      className={`h-11 flex-row items-center justify-between px-3.5 ${on ? 'bg-sky-50' : 'active:bg-app'}`}
                    >
                      <Text className={`text-15 ${on ? 'font-semibold text-primary-text' : 'font-medium text-ink'}`}>{b.name}</Text>
                      {on && <Icon as={Check} size={18} color={colors.primary.text} />}
                    </Pressable>
                  </View>
                );
              })}
              {list.length === 0 && <Text className="px-3.5 py-4 text-sm text-ink-300">찾는 은행이 없어요</Text>}
            </ScrollView>
          </View>
        )}
      </View>
      <View className="gap-2">
        <Text className="font-semibold text-13 text-ink-500">계좌번호</Text>
        <TextField
          accessibilityLabel="계좌번호"
          value={num}
          onChangeText={(s) => setNum(accountDigits(s))}
          keyboardType="number-pad"
          autoComplete="off"
          placeholder="- 없이 숫자만 입력"
        />
      </View>
      <View className="flex-row items-center gap-2">
        <Icon as={InfoCircle} size={16} color={colors.ink[500]} />
        <Text className="text-13 text-ink-500">본인 명의 계좌만 등록할 수 있어요</Text>
      </View>
      {error && <Text className="text-13 text-danger">{error}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ok, busy: saving }}
        disabled={!ok || saving}
        onPress={() => onSubmit(bankCode, num)}
        className={`h-14 items-center justify-center rounded-box ${ok ? 'bg-primary active:bg-primary-press' : 'bg-line'}`}
      >
        {saving ? (
          <ActivityIndicator color={colors.primary.on} />
        ) : (
          <Text className={`font-semibold text-17 ${ok ? 'text-primary-on' : 'text-ink-300'}`}>변경하기</Text>
        )}
      </Pressable>
    </>
  );
}
