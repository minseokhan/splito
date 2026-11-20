import { View } from 'react-native';

import { CATEGORY_ICON } from '@/components/categoryIcon';
import { Icon } from '@/components/Icon';
import type { CategoryCode } from '@/lib/category';
import { colors } from '@/theme/tokens';

// 카테고리 아이콘 원(노션 UI 업데이트 13·17번). 28px 원 + 16px 아이콘(일정표) / 40px 원 + 20px 아이콘(지출 내역·홈 최근 기록).
// onGray: 회색 박스 안 '기타'는 배경과 구분되도록 흰 원.
export function CategoryCircle({ code, size = 28, onGray = false }: { code: CategoryCode; size?: 28 | 40; onGray?: boolean }) {
  const c = colors.cat[code];
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: onGray && code === 'other' ? '#FFFFFF' : c.bg }}
      className="items-center justify-center"
    >
      <Icon as={CATEGORY_ICON[code]} size={size === 40 ? 20 : 16} color={c.icon} />
    </View>
  );
}
