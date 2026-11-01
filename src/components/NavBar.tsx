import { router } from 'expo-router';
import { NavArrowLeft, Xmark } from 'iconoir-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { Icon } from './Icon';

type Props = {
  title?: string;
  /** center: 제목 가운데(오른쪽 자리 맞춤), left: 뒤로 아이콘 옆 */
  align?: 'left' | 'center';
  close?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  color?: string;
  /** 제목 글자 크기. 기본 17 */
  titleSize?: number;
};

// 네비게이션 바 52. 좌측 뒤로가기 28(패딩 8), 제목 17/600.
export function NavBar({ title, align = 'left', close, onBack, right, color = colors.ink.DEFAULT, titleSize = 17 }: Props) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')));
  return (
    <View className="h-[52px] flex-row items-center justify-between px-3">
      <View className="flex-1 flex-row items-center gap-1">
        <Pressable accessibilityRole="button" accessibilityLabel={close ? '닫기' : '뒤로'} onPress={back} hitSlop={4} className="p-2">
          <Icon as={close ? Xmark : NavArrowLeft} size={close ? 26 : 28} color={color} />
        </Pressable>
        {title && align === 'left' && (
          <Text style={{ color, fontSize: titleSize }} className="flex-1 font-semibold" numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      {title && align === 'center' && (
        <Text style={{ color, fontSize: titleSize }} className="max-w-[60%] font-semibold" numberOfLines={1}>
          {title}
        </Text>
      )}
      <View className="flex-1 flex-row items-center justify-end">{right}</View>
    </View>
  );
}
