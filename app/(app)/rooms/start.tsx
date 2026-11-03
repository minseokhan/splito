import { router } from 'expo-router';
import { EditPencil, NavArrowRight, Suitcase } from 'iconoir-react-native';
import type { ComponentType } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { colors } from '@/theme/tokens';

type CardProps = {
  icon: ComponentType<SvgProps>;
  title: string;
  badge?: string;
  description: string;
  onPress: () => void;
};

// 선택 카드: radius 20, 테두리 1.5, 아이콘 타일 48/radius 16. 세로 패딩 24로 높이를 키운다.
function Card({ icon, title, badge, description, onPress }: CardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3.5 rounded-card border-[1.5px] border-line px-[18px] py-6 active:bg-sky-50"
    >
      <View className="h-12 w-12 items-center justify-center rounded-button bg-sky-100">
        <Icon as={icon} size={24} color={colors.primary.text} />
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text className="font-semibold text-[17px] text-ink">{title}</Text>
          {!!badge && (
            <View className="rounded-[6px] bg-sky-100 px-[7px] py-px">
              <Text className="font-semibold text-[11px] text-primary-text">{badge}</Text>
            </View>
          )}
        </View>
        <Text className="text-sm text-ink-500">{description}</Text>
      </View>
      <Icon as={NavArrowRight} size={20} color={colors.ink[300]} />
    </Pressable>
  );
}

export default function StartRoom() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="새 여행" />
      <View className="gap-3 px-5 pt-3">
        <Text className="mb-3 font-semibold text-2xl text-ink">여행을 어떻게 시작할까요?</Text>
        <Card
          icon={EditPencil}
          title="직접 만들기"
          description="여행 이름과 통화만 정하면 바로 시작해요"
          onPress={() => router.push('/rooms/new')}
        />
        <Card
          icon={Suitcase}
          title="패키지 예약 불러오기"
          badge="하나투어"
          description="예약번호로 일정과 선결제 금액을 불러와요"
          onPress={() => router.push('/rooms/booking')}
        />
      </View>
    </SafeAreaView>
  );
}
