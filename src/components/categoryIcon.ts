import { Bus, Camera, Cutlery, Handbag, HomeSimple, Label } from 'iconoir-react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import type { CategoryCode } from '@/lib/category';

// 카테고리 칩 아이콘. 코드 집합은 src/lib/category.ts가 단일 출처다.
export const CATEGORY_ICON: Record<CategoryCode, ComponentType<SvgProps>> = {
  food: Cutlery,
  shopping: Handbag,
  sightseeing: Camera,
  lodging: HomeSimple,
  transport: Bus,
  other: Label,
};
