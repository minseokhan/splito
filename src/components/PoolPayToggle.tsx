import { NavArrowRight, User, Wallet, WarningTriangle } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { formatKrw } from '@/lib/money';
import { colors } from '@/theme/tokens';

type Kind = 'member' | 'pool';

// [개인 결제 | 공금 결제] 토글 + 공금 꺼짐 안내 시트 + 잔액 부족 경고(노션 39번). 확인하고 나누기·말로 입력 공통.
// 공금이 꺼져 있으면 '공금'을 눌러도 토글은 바뀌지 않고 안내 시트만 뜬다.
export function PoolPayToggle({
  value,
  poolEnabled,
  onChange,
  onSetup,
  shortage,
}: {
  value: Kind;
  poolEnabled: boolean;
  onChange: (k: Kind) => void;
  onSetup: () => void;
  shortage: { over: number; after: number } | null; // poolShortage 결과. 공금 결제일 때만 보인다.
}) {
  const [offSheet, setOffSheet] = useState(false);
  const press = (k: Kind) => (k === 'pool' && !poolEnabled && value !== 'pool' ? setOffSheet(true) : onChange(k));

  return (
    <>
      <View className="flex-row gap-0.5 self-center rounded-chip bg-line p-[3px]">
        {(['member', 'pool'] as const).map((k) => {
          const on = value === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={k === 'pool' ? '공금 결제' : '개인 결제'}
              onPress={() => press(k)}
              style={on ? { boxShadow: '0 1px 3px rgba(19,25,39,.12)' } : undefined}
              className={`h-[34px] flex-row items-center justify-center gap-1.5 rounded-toggle px-[18px] ${on ? 'bg-white' : ''}`}
            >
              <Icon as={k === 'pool' ? Wallet : User} size={16} color={on ? colors.primary.text : colors.ink[300]} />
              <Text className={`font-semibold text-sm ${on ? 'text-ink' : 'text-ink-400'}`}>{k === 'pool' ? '공금 결제' : '개인 결제'}</Text>
            </Pressable>
          );
        })}
      </View>

      {value === 'pool' && shortage && (
        <View accessibilityRole="alert" className="flex-row gap-2.5 rounded-button bg-warning-bg px-4 py-3">
          <Icon as={WarningTriangle} size={18} color={colors.warning.DEFAULT} />
          <View className="flex-1 gap-0.5">
            <Text className="font-semibold text-sm text-warning-deep">공금 잔액보다 {formatKrw(shortage.over)} 많아요</Text>
            <Text className="text-13 text-warning-deep">
              기록하면 공금 잔액이 {shortage.after < 0 ? `−${formatKrw(-shortage.after)}` : formatKrw(shortage.after)}이 돼요. 부족분은
              공금 참여자가 1/N로 채워요.
            </Text>
          </View>
        </View>
      )}

      <BottomSheet visible={offSheet} onClose={() => setOffSheet(false)}>
        <View className="gap-4">
          <View className="h-[52px] w-[52px] items-center justify-center rounded-full bg-warning-bg">
            <Icon as={Wallet} size={26} color={colors.warning.DEFAULT} />
          </View>
          <View className="gap-1.5">
            <Text className="font-semibold text-xl text-ink">아직 공금을 쓰지 않고 있어요</Text>
            <Text className="text-15 text-ink-500">{'공금 지갑을 설정하면\n동행과 모은 돈으로 지출을 기록할 수 있어요'}</Text>
          </View>
          <View className="mt-1 flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => setOffSheet(false)}
              className="h-14 w-[100px] items-center justify-center rounded-button bg-muted active:opacity-80"
            >
              <Text className="font-semibold text-base text-ink">닫기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOffSheet(false);
                onSetup();
              }}
              className="h-14 flex-1 flex-row items-center justify-center gap-1 rounded-button bg-primary active:bg-primary-press"
            >
              <Text className="font-semibold text-base text-primary-on">공금 지갑 설정하기</Text>
              <Icon as={NavArrowRight} size={18} color={colors.primary.on} />
            </Pressable>
          </View>
        </View>
      </BottomSheet>
    </>
  );
}
