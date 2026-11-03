import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SplitoMark } from '@/components/Logo';
import { NavBar } from '@/components/NavBar';
import { RoomForm } from '@/components/RoomForm';
import { useCreateRoom } from '@/hooks/useRooms';

export default function NewRoom() {
  const create = useCreateRoom();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="직접 만들기" />
      <RoomForm
        heading="어디로 떠나나요?"
        submitLabel="만들기"
        defaultValues={{ name: '', baseCurrency: 'KRW', startDate: '', endDate: '' }}
        onSubmit={async (v) => {
          const roomId = await create.mutateAsync({
            name: v.name,
            baseCurrency: v.baseCurrency,
            startDate: v.startDate || undefined,
            endDate: v.endDate || undefined,
          });
          router.replace({ pathname: '/rooms/[roomId]', params: { roomId } });
        }}
      >
        <View className="flex-row items-center gap-2 rounded-chip bg-sky-100 px-3.5 py-3.5">
          <SplitoMark size={24} />
          <Text className="flex-1 text-sm text-ink">생성 후 함께하는 동행을 초대할 수 있어요!</Text>
        </View>
      </RoomForm>
    </SafeAreaView>
  );
}
