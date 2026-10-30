import { Pressable, Text } from 'react-native';

// 방 활동 시스템 메시지. 날짜 그룹 카드 안의 보조 한 줄이다. onPress가 있을 때만 탭할 수 있다.
export function ActivityRow({ text, onPress }: { text: string; onPress?: () => void }) {
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      className="min-h-11 justify-center py-3"
    >
      <Text className={`text-[13px] ${onPress ? 'font-semibold text-primary-text' : 'text-ink-400'}`}>
        {onPress ? `${text} · 계좌 등록하기` : text}
      </Text>
    </Pressable>
  );
}
