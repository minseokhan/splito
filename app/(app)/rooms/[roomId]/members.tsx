import { useLocalSearchParams } from 'expo-router';
import { NavArrowRight, UserPlus } from 'iconoir-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, GuestChip } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { InviteSheet } from '@/components/InviteSheet';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useAddGuest, useRemoveGuest, useUpdateGuest } from '@/hooks/useGuests';
import { useRoomMembers } from '@/hooks/useRooms';
import { repChangeWarning } from '@/lib/guestView';
import { colors } from '@/theme/tokens';
import type { MemberId, RoomMember } from '@/types/domain';

const showError = (e: unknown) => Alert.alert((e as { message?: string }).message ?? '잠시 후 다시 시도해 주세요');

export default function Members() {
  const { roomId, addGuest } = useLocalSearchParams<{ roomId: string; addGuest?: string }>();
  const myId = useAuth().session?.user.id;
  const { data: members = [] } = useRoomMembers(roomId);
  // 시트 대상: 'new'면 게스트 추가, 멤버면 그 게스트 수정. 초대 시트의 '앱 없는 동행 추가'는 addGuest=1로 들어온다.
  const [sheet, setSheet] = useState<'new' | RoomMember | null>(addGuest ? 'new' : null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const active = members.filter((m) => !m.leftAt);
  const users = active.filter((m) => m.kind === 'user');
  const me = users.find((m) => m.userId === myId);
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const colorIndex = new Map(members.map((m, i) => [m.id, i]));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-app">
      <NavBar title="멤버" align="center" />
      <ScrollView contentContainerClassName="gap-2.5 px-5 pt-2" contentContainerStyle={{ paddingBottom: 200 }}>
        <Text className="px-1 font-bold text-[13px] text-ink-500">참여자 {active.length}명</Text>
        <View className="rounded-card bg-white px-4 py-1" style={{ boxShadow: '0 2px 4px -2px rgba(19,25,39,.06)' }}>
          {active.map((m, i) => {
            const guest = m.kind === 'guest';
            return (
              <Pressable
                key={m.id}
                accessibilityRole={guest ? 'button' : undefined}
                accessibilityLabel={guest ? `게스트 ${m.name} 수정` : undefined}
                disabled={!guest}
                onPress={() => setSheet(m)}
                className={`min-h-11 flex-row items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-muted' : ''}`}
              >
                <Avatar name={m.name} colorIndex={colorIndex.get(m.id) ?? 0} guest={guest} size={36} />
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text className="shrink font-bold text-[15px] text-ink" numberOfLines={1}>
                      {m.userId === myId ? `${m.name}(나)` : m.name}
                    </Text>
                    {guest && <GuestChip />}
                  </View>
                  {guest && (
                    <Text className="text-xs text-ink-400">대표 {names[m.representativeMemberId ?? ''] ?? ''}</Text>
                  )}
                </View>
                {guest && <Icon as={NavArrowRight} size={18} color={colors.ink[300]} />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <BottomBar bg={colors.app} fade>
        <PrimaryButton title="게스트 추가" icon={UserPlus} disabled={!me} onPress={() => setSheet('new')} />
        <PrimaryButton
          title="초대하기"
          variant="muted"
          onPress={() => setInviteOpen(true)}
        />
      </BottomBar>
      <InviteSheet roomId={roomId} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
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
    <BottomSheet visible onClose={onClose} title={guest ? '게스트 수정' : '게스트 추가'}>
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
        <Text className="text-[13px] text-ink-500">대표자 · 정산은 대표자가 대신 주고받아요</Text>
        <View className="flex-row flex-wrap gap-2">
          {users.map((u) => (
            <Pressable
              key={u.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: rep === u.id }}
              onPress={() => setRep(u.id)}
              className={`h-11 items-center justify-center rounded-chip px-4 ${rep === u.id ? 'bg-primary' : 'bg-muted'}`}
            >
              <Text className={`font-semibold text-[15px] ${rep === u.id ? 'text-primary-on' : 'text-ink'}`}>{u.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View className="gap-2">
        <PrimaryButton title={guest ? '저장' : '추가'} disabled={busy || !valid} onPress={submit} />
        {guest && <PrimaryButton title="삭제" variant="danger" disabled={busy} onPress={() => remove.mutate(guest.id, done)} />}
      </View>
    </BottomSheet>
  );
}
