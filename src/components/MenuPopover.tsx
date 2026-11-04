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

// 기간 선택·카테고리 선택 드롭다운. 행 높이 40, 선택한 행만 바탕색 + 체크.
export function MenuPopover({ at, width, items, onPick, onClose }: Props) {
  return (
    <Modal visible={!!at} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1">
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="닫기" onPress={onClose} />
        {at && (
          <View
            className="rounded-button border border-card-line bg-white p-1.5"
            style={{
              position: 'absolute',
              top: at.top,
              left: at.left,
              right: at.right,
              width,
              boxShadow: '0 10px 32px -4px rgba(14,27,61,.16)',
            }}
          >
            {items.map((it) => (
              <Pressable
                key={it.key}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: it.selected }}
                onPress={() => onPick(it.key)}
                // 메뉴 행 라운드 10은 토큰에 없다(프로토타입 실측).
                className={`flex-row items-center gap-2.5 rounded-[10px] px-3 py-2.5 ${it.selected ? 'bg-muted' : ''}`}
              >
                {it.icon && <Icon as={it.icon} size={18} color={colors.primary.text} />}
                <Text
                  className={`min-w-0 flex-1 text-[15px] ${it.selected ? 'font-semibold text-ink' : 'font-medium text-ink'}`}
                  numberOfLines={1}
                >
                  {it.label}
                </Text>
                {!!it.sub && <Text className="text-xs text-ink-400">{it.sub}</Text>}
                {it.selected && <Icon as={Check} size={18} color={colors.primary.text} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}
