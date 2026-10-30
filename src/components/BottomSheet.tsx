import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { visible: boolean; onClose: () => void; children: ReactNode; title?: string; subtitle?: string };

// 바텀시트: 스크림 rgba(19,25,39,.45), 상단 radius 28, 핸들 40×5. 스크림을 누르면 닫힌다.
export function BottomSheet({ visible, onClose, children, title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable accessibilityLabel="닫기" onPress={onClose} className="absolute inset-0 bg-[rgba(19,25,39,0.45)]" />
        <View className="gap-[18px] rounded-t-hero bg-white px-5 pt-3" style={{ paddingBottom: Math.max(insets.bottom + 16, 40) }}>
          <View className="h-[5px] w-10 self-center rounded-full bg-line" />
          {title && (
            <View className="gap-1">
              <Text className="font-bold text-xl text-ink">{title}</Text>
              {subtitle && <Text className="text-sm text-ink-500">{subtitle}</Text>}
            </View>
          )}
          {children}
        </View>
      </View>
    </Modal>
  );
}
