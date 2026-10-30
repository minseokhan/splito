import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { UserError } from '@/lib/errors';
import { colors } from '@/theme/tokens';

import { PrimaryButton } from './PrimaryButton';

type Props =
  | { state: 'parsing'; label: string; onCancel: () => void }
  | { state: 'failed'; error: UserError; onRetry?: () => void; onManual: () => void };

// UI_GUIDE 상태 화면: 인식 중 / 인식 실패. 실패해도 자동 재시도하지 않는다(비용).
export function ParsingState(props: Props) {
  if (props.state === 'parsing') {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-5">
        <ActivityIndicator size="large" color={colors.sky[800]} />
        <Text className="text-[15px] text-ink-700">{props.label}</Text>
        <Pressable accessibilityRole="button" onPress={props.onCancel} className="h-11 justify-center px-4">
          <Text className="font-medium text-[15px] text-sky-900">취소</Text>
        </Pressable>
      </View>
    );
  }
  const { error, onRetry, onManual } = props;
  return (
    <View className="flex-1 justify-center gap-2 px-5">
      <Text className="text-center font-semibold text-[17px] text-ink-900">{error.message}</Text>
      <View className="mt-6 gap-2">
        {onRetry && <PrimaryButton title="다시 시도" onPress={onRetry} />}
        <Pressable
          accessibilityRole="button"
          onPress={onManual}
          className="h-14 items-center justify-center rounded-xl bg-sky-200"
        >
          <Text className="font-semibold text-base text-ink-900">직접 입력</Text>
        </Pressable>
      </View>
    </View>
  );
}
