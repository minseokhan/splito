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

// 선택 카드: radius 20, 테두리 1, 패딩 18, 아이콘 타일 48/radius 12. 눌림은 회색 배경 + 하늘 테두리(시안 hover).
function Card({ icon, title, badge, description, onPress }: CardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3.5 rounded-card border border-line bg-white p-[18px] active:border-sky-200 active:bg-app"
    >
      <View className="h-12 w-12 items-center justify-center rounded-button bg-sky-100">
        <Icon as={icon} size={24} color={colors.primary.text} />
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text className="font-semibold text-17 leading-[27px] text-ink">{title}</Text>
          {!!badge && (
            <View className="rounded-badge bg-sky-100 px-[7px] py-px">
              <Text className="font-semibold text-11 text-primary-text">{badge}</Text>
            </View>
          )}
        </View>
        <Text className="text-sm leading-[22px] text-ink-500">{description}</Text>
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
        <Text className="mb-3 font-semibold text-2xl leading-[38px] text-ink">여행을 어떻게 시작할까요?</Text>
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
