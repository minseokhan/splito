import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Home() {
  // 여행 만들기 버튼은 3-rooms에서 연결한다.
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-white px-5">
      <Text className="font-semibold text-[17px] text-ink-900">첫 여행을 만들어 볼까요?</Text>
    </SafeAreaView>
  );
}
