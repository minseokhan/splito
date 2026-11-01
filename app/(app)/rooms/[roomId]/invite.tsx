import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { INVITE_SUBTITLE, INVITE_TITLE, InviteOptions } from '@/components/InviteSheet';
import { NavBar } from '@/components/NavBar';

// 기존 경로·딥링크 호환용. 상세 화면의 초대 시트와 같은 내용을 전체 화면으로 보여준다.
export default function Invite() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
      <NavBar close />
      <View className="gap-[18px] px-5 pt-2">
        <View className="gap-1">
          <Text className="font-semibold text-xl text-ink">{INVITE_TITLE}</Text>
          <Text className="text-sm text-ink-500">{INVITE_SUBTITLE}</Text>
        </View>
        <InviteOptions roomId={roomId} />
      </View>
    </SafeAreaView>
  );
}
