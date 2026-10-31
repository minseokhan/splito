import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { UserError } from '@/lib/errors';
import { colors } from '@/theme/tokens';

import { BottomBar, PrimaryButton } from './PrimaryButton';

type Props =
  | { state: 'parsing'; label: string; onCancel: () => void }
  | { state: 'failed'; error: UserError; onRetry?: () => void; onManual: () => void; onOpenSettings?: () => void };

// 상태 화면: 인식 중 / 인식 실패. 실패해도 자동 재시도하지 않는다(비용).
export function ParsingState(props: Props) {
  if (props.state === 'parsing') {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-5">
        <View className="h-16 w-16 items-center justify-center rounded-[22px] bg-sky-100">
          <ActivityIndicator size="large" color={colors.primary.text} />
        </View>
        <Text className="font-bold text-[17px] text-ink">{props.label}</Text>
        <Pressable accessibilityRole="button" onPress={props.onCancel} className="mt-2 h-11 justify-center rounded-full bg-muted px-5">
          <Text className="font-semibold text-[15px] text-ink-700">취소</Text>
        </Pressable>
      </View>
    );
  }
  const { error, onRetry, onManual, onOpenSettings } = props;
  return (
    <View className="flex-1">
      <View className="flex-1 justify-center px-5">
        <Text className="text-center font-bold text-[19px] leading-[27px] text-ink">{error.message}</Text>
      </View>
      <BottomBar>
        {onOpenSettings && <PrimaryButton title="설정 열기" onPress={onOpenSettings} />}
        {onRetry && <PrimaryButton title="다시 시도" onPress={onRetry} />}
        <PrimaryButton title="직접 입력" variant="muted" onPress={onManual} />
      </BottomBar>
    </View>
  );
}
