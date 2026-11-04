import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

type Props = { visible: boolean; onClose: () => void; children: ReactNode; title?: string; subtitle?: string };

const ENTER_MS = 260;
const EXIT_MS = 200;
// 키보드 위에 붙을 때 시트 흰 바닥을 키보드 밑으로 이만큼 더 깐다 —
// 그러지 않으면 키보드 위쪽 둥근 모서리 사이로 스크림이 까맣게 비친다.
// iOS 26 키보드의 모서리 반지름(실측 ~18)보다 넉넉히 잡는다. 같은 값만큼 paddingBottom을
// 더하므로 내용 위치는 그대로다.
const KEYBOARD_OVERLAP = 32;

// 바텀시트: 스크림 rgba(19,25,39,.45), 상단 radius 28, 핸들 40×5. 스크림을 누르면 닫힌다.
// Modal의 animationType="slide"는 스크림까지 같이 밀어 어색해서, 시트만 슬라이드하고 스크림은 즉시 켜고 끈다.
export function BottomSheet({ visible, onClose, children, title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  // Modal은 Android의 adjustResize를 안 받으므로 iOS에서만 키보드 높이만큼 직접 들어올린다.
  const keyboard = useKeyboardHeight();
  const lift = Platform.OS === 'ios' ? keyboard : 0;
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
            // 키보드가 올라와 있으면 홈 인디케이터 여백이 필요 없다 — 입력칸이 키보드에 붙게 둔다.
            style={{
              marginBottom: Math.max(lift - KEYBOARD_OVERLAP, 0),
              paddingBottom: keyboard > 0 ? 16 + KEYBOARD_OVERLAP : Math.max(insets.bottom + 16, 40),
            }}
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
