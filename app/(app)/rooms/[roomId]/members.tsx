import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, GuestChip } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useAddGuest, useRemoveGuest, useUpdateGuest } from '@/hooks/useGuests';
import { useRoomMembers } from '@/hooks/useRooms';
import { repChangeWarning } from '@/lib/guestView';
import type { MemberId, RoomMember } from '@/types/domain';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

export default function Members() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const myId = useAuth().session?.user.id;
  const { data: members = [] } = useRoomMembers(roomId);
  // 시트 대상: 'new'면 게스트 추가, 멤버면 그 게스트 수정
  const [sheet, setSheet] = useState<'new' | RoomMember | null>(null);

  const active = members.filter((m) => !m.leftAt);
  const users = active.filter((m) => m.kind === 'user');
  const me = users.find((m) => m.userId === myId);
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const colorIndex = new Map(members.map((m, i) => [m.id, i]));

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-2 px-5 pb-6">
        <Text className="mb-2 mt-6 font-bold text-[22px] text-ink-900">멤버</Text>
        {active.map((m) => {
          const guest = m.kind === 'guest';
          return (
            <Pressable
              key={m.id}
              accessibilityRole={guest ? 'button' : undefined}
              accessibilityLabel={guest ? `게스트 ${m.name} 수정` : undefined}
              disabled={!guest}
              onPress={() => setSheet(m)}
              className="min-h-11 flex-row items-center gap-3 py-2"
            >
              <Avatar name={m.name} colorIndex={colorIndex.get(m.id) ?? 0} guest={guest} size={36} />
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="font-semibold text-[15px] text-ink-900" numberOfLines={1}>
                    {m.userId === myId ? `${m.name}(나)` : m.name}
                  </Text>
                  {guest && <GuestChip />}
                </View>
                {guest && (
                  <Text className="text-[13px] text-ink-500">대표 {names[m.representativeMemberId ?? ''] ?? ''}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View className="gap-2 px-5 pb-4">
        <PrimaryButton title="게스트 추가" disabled={!me} onPress={() => setSheet('new')} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/rooms/[roomId]/invite', params: { roomId } })}
          className="h-14 items-center justify-center rounded-xl bg-sky-200"
        >
          <Text className="font-semibold text-base text-ink-900">초대하기</Text>
        </Pressable>
      </View>
      {sheet && me && (
        <GuestSheet
          roomId={roomId}
          guest={sheet === 'new' ? null : sheet}
          users={users}
          defaultRep={me.id}
          names={names}
          onClose={() => setSheet(null)}
        />
      )}
    </SafeAreaView>
  );
}

type SheetProps = {
  roomId: string;
  guest: RoomMember | null; // null이면 추가
  users: RoomMember[]; // 대표자 후보: 활성 가입 멤버만
  defaultRep: MemberId;
  names: Record<MemberId, string>;
  onClose: () => void;
};

// 게스트 추가·수정. 대표자를 바꾸면 과거 정산 귀속도 옮겨지므로 한 번 더 확인한다(J9 4번).
function GuestSheet({ roomId, guest, users, defaultRep, names, onClose }: SheetProps) {
  const [name, setName] = useState(guest?.name ?? '');
  const [rep, setRep] = useState<MemberId>(guest?.representativeMemberId ?? defaultRep);
  const add = useAddGuest(roomId);
  const update = useUpdateGuest(roomId);
  const remove = useRemoveGuest(roomId);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 12;
  const busy = add.isPending || update.isPending || remove.isPending;
  const done = { onSuccess: onClose, onError: showError };

  const submit = () => {
    if (!guest) return add.mutate({ roomId, name: trimmed, representativeMemberId: rep }, done);
    const save = () =>
      update.mutate(
        {
          memberId: guest.id,
          name: trimmed !== guest.name ? trimmed : undefined,
          representativeMemberId: rep !== guest.representativeMemberId ? rep : undefined,
        },
        done,
      );
    if (rep === guest.representativeMemberId) return save();
    Alert.alert('대표자를 바꿀까요?', repChangeWarning(trimmed, names[rep] ?? ''), [
      { text: '취소', style: 'cancel' },
      { text: '바꾸기', onPress: save },
    ]);
  };

  return (
    <BottomSheet visible onClose={onClose}>
      <Text className="mb-4 font-semibold text-[17px] text-ink-900">{guest ? '게스트 수정' : '게스트 추가'}</Text>
      <TextInput
        accessibilityLabel="게스트 이름"
        placeholder="이름(예: 엄마)"
        value={name}
        onChangeText={setName}
        maxLength={12}
        className="mb-4 h-12 rounded-lg border border-input-line bg-white px-4 text-base text-ink-900 focus:border-sky-800 focus:bg-sky-100"
      />
      <Text className="mb-2 text-[13px] text-ink-500">대표자 · 정산은 대표자가 대신 주고받아요</Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {users.map((u) => (
          <Pressable
            key={u.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: rep === u.id }}
            onPress={() => setRep(u.id)}
            className={`h-11 items-center justify-center rounded-md px-4 ${rep === u.id ? 'bg-sky-300' : 'bg-sky-100'}`}
          >
            <Text className="font-semibold text-[15px] text-ink-900">{u.name}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton title={guest ? '저장' : '추가'} disabled={busy || !valid} onPress={submit} />
      {guest && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => remove.mutate(guest.id, done)}
          className="mt-2 h-14 items-center justify-center rounded-xl border border-[#F2C4C4] bg-white"
        >
          <Text className="text-base text-minus">삭제</Text>
        </Pressable>
      )}
    </BottomSheet>
  );
}
