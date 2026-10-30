import { Pressable, Text } from 'react-native';

// 방 활동 시스템 메시지. 카드가 아니라 보조 스타일 한 줄이다. onPress가 있을 때만 탭할 수 있다.
export function ActivityRow({ text, onPress }: { text: string; onPress?: () => void }) {
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      className="min-h-11 justify-center px-2 py-1"
    >
      <Text className={`text-center text-[13px] ${onPress ? 'text-sky-900' : 'text-ink-500'}`}>
        {onPress ? `${text} · 계좌 등록하기` : text}
      </Text>
    </Pressable>
  );
}
