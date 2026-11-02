import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useAddGuest, useRemoveGuest, useUpdateGuest } from '@/hooks/useGuests';
import { useRoomMembers } from '@/hooks/useRooms';
import { repChangeWarning } from '@/lib/guestView';
import { colors } from '@/theme/tokens';
import type { MemberId, RoomMember } from '@/types/domain';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

type Props = {
  roomId: string;
  guest: RoomMember | null; // null이면 추가
  onClose: () => void;
};

// 게스트 추가·수정 폼. 바깥 시트가 열고 닫는다. 초대 시트와 멤버 화면이 같이 쓴다.
// 대표자를 바꾸면 게스트 송금을 대신 눌러줄 사람이 바뀌므로 한 번 더 확인한다(J9 4번).
export function GuestForm({ roomId, guest, onClose }: Props) {
  const myId = useAuth().session?.user.id;
  const { data: members = [] } = useRoomMembers(roomId);
  const active = members.filter((m) => !m.leftAt);
  const users = active.filter((m) => m.kind === 'user'); // 대표자 후보
  const me = users.find((m) => m.userId === myId);
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

  const [name, setName] = useState(guest?.name ?? '');
  const [rep, setRep] = useState<MemberId | null>(guest?.representativeMemberId ?? null);
  const add = useAddGuest(roomId);
  const update = useUpdateGuest(roomId);
  const remove = useRemoveGuest(roomId);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 12;
  const busy = add.isPending || update.isPending || remove.isPending;
  const done = { onSuccess: onClose, onError: showError };
  const repId = rep ?? me?.id;

  if (!me || !repId) return null; // 내가 활성 가입 멤버가 아니면 게스트를 못 만든다

  const submit = () => {
    if (!guest) return add.mutate({ roomId, name: trimmed, representativeMemberId: repId }, done);
    const save = () =>
      update.mutate(
        {
          memberId: guest.id,
          name: trimmed !== guest.name ? trimmed : undefined,
          representativeMemberId: repId !== guest.representativeMemberId ? repId : undefined,
        },
        done,
      );
    if (repId === guest.representativeMemberId) return save();
    Alert.alert('대표자를 바꿀까요?', repChangeWarning(trimmed, names[repId] ?? ''), [
      { text: '취소', style: 'cancel' },
      { text: '바꾸기', onPress: save },
    ]);
  };

  return (
    <View className="gap-[18px]">
      <TextInput
        accessibilityLabel="게스트 이름"
        placeholder="이름(예: 엄마)"
        placeholderTextColor={colors.ink[300]}
        value={name}
        onChangeText={setName}
        maxLength={12}
        className="h-[54px] rounded-input border-[1.5px] border-line bg-white px-4 font-semibold text-[17px] text-ink focus:border-primary"
      />
      <View className="gap-2">
        <Text className="text-[13px] text-ink-500">대표자 · 게스트 정산을 대신 기록하고 알려줘요</Text>
        <View className="flex-row flex-wrap gap-2">
          {users.map((u) => (
            <Pressable
              key={u.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: repId === u.id }}
              onPress={() => setRep(u.id)}
              className={`h-11 items-center justify-center rounded-chip px-4 ${repId === u.id ? 'bg-primary' : 'bg-muted'}`}
            >
              <Text className={`font-semibold text-base ${repId === u.id ? 'text-primary-on' : 'text-ink'}`}>{u.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View className="gap-2">
        <PrimaryButton title={guest ? '저장' : '추가'} disabled={busy || !valid} onPress={submit} />
        {guest && <PrimaryButton title="삭제" variant="danger" disabled={busy} onPress={() => remove.mutate(guest.id, done)} />}
      </View>
    </View>
  );
}
