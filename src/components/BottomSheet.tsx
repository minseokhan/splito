import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { visible: boolean; onClose: () => void; children: ReactNode };

// UI_GUIDE 바텀시트: 상단 라운드 16 + 손잡이 바. 바깥(딤)을 누르면 닫힌다.
export function BottomSheet({ visible, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable accessibilityLabel="닫기" onPress={onClose} className="absolute inset-0 bg-black/30" />
        <View className="rounded-t-2xl bg-white px-5 pt-2" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-divider" />
          {children}
        </View>
      </View>
    </Modal>
  );
}
