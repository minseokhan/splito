import { Check } from 'iconoir-react-native';
import type { ComponentType } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import { colors } from '@/theme/tokens';

import { Icon } from './Icon';

export type MenuItem = {
  key: string;
  label: string;
  sub?: string;
  icon?: ComponentType<SvgProps>;
  selected: boolean;
  danger?: boolean; // [일정 삭제] 같은 빨간 행
};

// 누른 요소 바로 아래에 붙으므로 좌표는 호출부가 measureInWindow로 잰다(PeoplePopover와 같은 방식).
export type MenuAnchor = { top: number; left?: number; right?: number };

type Props = {
  at: MenuAnchor | null;
  width: number;
  items: MenuItem[];
  onPick: (key: string) => void;
  onClose: () => void;
};

// 카테고리 드롭다운·일정 '…' 메뉴. 행 위아래 9 · 둥글기 8 · 14px, 선택한 행만 바탕 app + 600 + 체크, 누르면 바탕 app. 팝업 둥글기 16(노션 19번 ⑤).
export function MenuPopover({ at, width, items, onPick, onClose }: Props) {
  return (
    <Modal visible={!!at} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1">
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="닫기" onPress={onClose} />
        {at && (
          <View
            className="rounded-box border border-card-line bg-white p-1.5"
            style={{
              position: 'absolute',
              top: at.top,
              left: at.left,
              right: at.right,
              width,
              boxShadow: '0 10px 32px -4px rgba(23,32,58,.16), 0 6px 14px -6px rgba(23,32,58,.12)',
            }}
          >
            {items.map((it) => (
              <Pressable
                key={it.key}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: it.selected }}
                onPress={() => onPick(it.key)}
                className={`flex-row items-center gap-2.5 rounded-badge px-3 py-[9px] active:bg-app ${it.selected ? 'bg-app' : ''}`}
              >
                {it.icon && <Icon as={it.icon} size={17} color={colors.primary.text} />}
                <Text
                  className={`min-w-0 flex-1 text-sm ${it.selected ? 'font-semibold' : 'font-medium'} ${it.danger ? 'text-danger' : 'text-ink'}`}
                  numberOfLines={1}
                >
                  {it.label}
                </Text>
                {!!it.sub && <Text className="text-xs text-ink-400">{it.sub}</Text>}
                {it.selected && <Icon as={Check} size={17} color={colors.primary.text} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}
