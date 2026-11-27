import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, SlideInDown, SlideOutDown, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { visible: boolean; onClose: () => void; children: ReactNode; title?: string; subtitle?: string };

// 시안: 시트 320ms cubic-bezier(0.2,0.8,0.2,1), 바운스 없음.
const ENTER_MS = 320;
const EXIT_MS = 200;

// 시트를 닫자마자 다른 시트(Modal)를 띄우면 iOS가 앞 Modal이 내려가는 중이라 새 Modal을 못 띄우고
// 화면 전체가 터치를 먹은 채 멈춘다(2026-11-24 실기기, 지출 메뉴 → 수정 내역). 앞 시트가 내려간 뒤에 연다.
export const afterSheet = (open: () => void) => setTimeout(open, EXIT_MS + 150);

// 키보드 들어올림(iOS): 네이티브 키보드 추적값으로 시트를 translateY한다. JS 키보드 이벤트 + margin 재배치로는
// 실기기에서 autoFocus 시트가 키보드에 통째로 가려졌다(2026-11-20·21 재현). 시트 바닥 여백(홈 인디케이터 + 16)은
// 키보드 밑으로 들어가 키보드 둥근 모서리 사이 틈을 흰색으로 메운다. Android는 들어올리지 않는다(기존 동작).
// ponytail: useAnimatedKeyboard는 reanimated에서 deprecated — keyboard-controller를 들이면 그쪽으로 옮긴다.
const useLift =
  Platform.OS === 'ios'
    ? (bottomInset: number) => {
        const kb = useAnimatedKeyboard();
        return useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(kb.height.value - bottomInset, 0) }] }));
      }
    : () => undefined;

// 바텀시트: 스크림 rgba(23,32,58,.45), 상단 radius 20, 핸들 40×5. 스크림을 누르면 닫힌다.
// Modal의 animationType="slide"는 스크림까지 같이 밀어 어색해서, 시트만 슬라이드하고 스크림은 즉시 켜고 끈다.
export function BottomSheet({ visible, onClose, children, title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  const liftStyle = useLift(insets.bottom);
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
        {visible && <Pressable accessibilityLabel="닫기" onPress={onClose} className="absolute inset-0 bg-[rgba(23,32,58,0.45)]" />}
        {/* 들어올림은 슬라이드 애니메이션이 없는 바깥 뷰가 맡는다(entering과 transform이 겹치지 않게). */}
        <Animated.View pointerEvents="box-none" style={liftStyle}>
          {visible && (
            <Animated.View
              entering={SlideInDown.duration(ENTER_MS).easing(Easing.bezier(0.2, 0.8, 0.2, 1))}
              exiting={SlideOutDown.duration(EXIT_MS)}
              className="gap-[18px] rounded-t-sheet bg-white px-5 pt-3"
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
        </Animated.View>
      </View>
    </Modal>
  );
}
