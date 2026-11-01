import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useInvitePreview, useJoinRoom } from '@/hooks/useRooms';
import type { UserError } from '@/lib/errors';
import { clearPendingInvite } from '@/services/pendingInvite';

const INVALID = '사용할 수 없는 초대예요. 초대한 분께 새 링크를 요청하세요';

// 합류 확인 시트(J2). 시트 없이 자동 합류하지 않는다(잘못 누른 링크 방지).
export default function JoinSheet() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const preview = useInvitePreview(token);
  const join = useJoinRoom();
  const error = (preview.error ?? join.error) as UserError | null;
  const invalid = error?.code === 'INVITE_INVALID';
  const alreadyRoomId = preview.data?.alreadyMember ? preview.data.roomId : undefined;

  const goRoom = (roomId: string) => router.replace({ pathname: '/rooms/[roomId]', params: { roomId } });
  const close = () => {
    clearPendingInvite().catch(() => undefined);
    router.replace('/home');
  };

  // 이미 참여 중이면 시트 없이 그 방으로(J2-D).
  useEffect(() => {
    if (!alreadyRoomId) return;
    clearPendingInvite().catch(() => undefined);
    goRoom(alreadyRoomId);
  }, [alreadyRoomId]);

  useEffect(() => {
    if (invalid) clearPendingInvite().catch(() => undefined);
  }, [invalid]);

  const submit = () =>
    join.mutate(token, {
      onSuccess: (roomId) => {
        clearPendingInvite().catch(() => undefined);
        goRoom(roomId);
      },
    });

  if (alreadyRoomId) return null;
  const p = preview.data;

  return (
    <View className="flex-1 justify-end bg-[rgba(19,25,39,0.45)]">
      <SafeAreaView edges={['bottom']} className="gap-[18px] rounded-t-hero bg-white px-5 pb-4 pt-3">
        <View className="h-[5px] w-10 self-center rounded-full bg-line" />
        {invalid ? (
          <Text className="text-base text-ink-700">{INVALID}</Text>
        ) : p ? (
          <View className="flex-row items-center gap-3.5">
            <Avatar name={p.inviterNickname || p.roomName} colorIndex={0} size={48} />
            <View className="flex-1 gap-1">
              <Text className="font-semibold text-xl text-ink">{p.roomName} 여행에 참여할까요?</Text>
              <Text className="text-sm text-ink-500">
                {p.inviterNickname ? `${p.inviterNickname}님이 초대했어요 · ` : ''}
                {p.memberCount}명 참여 중
              </Text>
            </View>
          </View>
        ) : error ? (
          <Text className="text-base text-ink-700">{error.message}</Text>
        ) : (
          <Text className="text-base text-ink-500">초대를 확인하고 있어요</Text>
        )}
        <View className="gap-1">
          {error && !invalid && !p ? (
            <PrimaryButton title="다시 시도" onPress={() => preview.refetch()} />
          ) : !invalid ? (
            <>
              {join.error && !invalid && <Text className="mb-2 text-center text-[13px] text-danger">{error?.message}</Text>}
              <PrimaryButton title="참여하기" onPress={submit} loading={join.isPending} disabled={!p} />
            </>
          ) : null}
          <Pressable accessibilityRole="button" onPress={close} className="h-11 items-center justify-center">
            <Text className="font-semibold text-base text-ink-500">{invalid ? '확인' : '나중에'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
