import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { visible: boolean; onClose: () => void; children: ReactNode; title?: string; subtitle?: string };

const ENTER_MS = 260;
const EXIT_MS = 200;

// 바텀시트: 스크림 rgba(19,25,39,.45), 상단 radius 28, 핸들 40×5. 스크림을 누르면 닫힌다.
// Modal의 animationType="slide"는 스크림까지 같이 밀어 어색해서, 시트만 슬라이드하고 스크림은 즉시 켜고 끈다.
export function BottomSheet({ visible, onClose, children, title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  // 내려가는 애니메이션이 끝날 때까지 Modal을 띄워 둔다. ponytail: 타이머가 EXIT_MS와 짝이다.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    if (visible) return;
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {visible && <Pressable accessibilityLabel="닫기" onPress={onClose} className="absolute inset-0 bg-[rgba(19,25,39,0.45)]" />}
        {visible && (
          <Animated.View
            entering={SlideInDown.duration(ENTER_MS)}
            exiting={SlideOutDown.duration(EXIT_MS)}
            className="gap-[18px] rounded-t-hero bg-white px-5 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom + 16, 40) }}
          >
            <View className="h-[5px] w-10 self-center rounded-full bg-line" />
            {title && (
              <View className="gap-1">
                <Text className="font-semibold text-xl text-ink">{title}</Text>
                {subtitle && <Text className="text-sm text-ink-500">{subtitle}</Text>}
              </View>
            )}
            {children}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}
