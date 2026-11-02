import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavBar } from '@/components/NavBar';
import { RoomForm } from '@/components/RoomForm';
import { useRoom, useUpdateRoom } from '@/hooks/useRooms';

export default function EditRoom() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { data: room } = useRoom(roomId);
  const update = useUpdateRoom(roomId);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <NavBar title="여행 수정" />
      {!!room && (
        <RoomForm
          heading="여행 정보를 바꿔요"
          submitLabel="저장"
          defaultValues={{
            name: room.name,
            baseCurrency: room.base_currency,
            startDate: room.start_date ?? '',
            endDate: room.end_date ?? '',
          }}
          // 지출이 있으면 서버가 기본 통화 변경을 CURRENCY_LOCKED로 막는다.
          onSubmit={async (v) => {
            await update.mutateAsync({
              roomId,
              name: v.name,
              baseCurrency: v.baseCurrency,
              startDate: v.startDate || null,
              endDate: v.endDate || null,
            });
            router.back();
          }}
        />
      )}
    </SafeAreaView>
  );
}
