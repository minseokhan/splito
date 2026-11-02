import { useLocalSearchParams } from 'expo-router';
import { NavArrowRight, UserPlus } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, GuestChip } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { GuestForm } from '@/components/GuestForm';
import { Icon } from '@/components/Icon';
import { INVITE_SUBTITLE, INVITE_TITLE, InviteOptions } from '@/components/InviteSheet';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useRoomMembers } from '@/hooks/useRooms';
import { colors } from '@/theme/tokens';
import type { RoomMember } from '@/types/domain';

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
        <Text className="px-1 font-semibold text-[13px] text-ink-500">참여자 {active.length}명</Text>
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
                    <Text className="shrink font-semibold text-base text-ink" numberOfLines={1}>
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
        <PrimaryButton title="초대하기" icon={UserPlus} onPress={() => setInviteOpen(true)} />
      </BottomBar>
      {/* 초대와 게스트 추가는 시트 하나를 번갈아 쓴다 — iOS는 Modal이 닫히는 중에 다음 Modal을 띄우면 그걸 무시한다. */}
      <BottomSheet
        visible={inviteOpen || (!!sheet && !!me)}
        onClose={() => {
          setInviteOpen(false);
          setSheet(null);
        }}
        title={sheet && me ? (sheet === 'new' ? '게스트 추가' : '게스트 수정') : INVITE_TITLE}
        subtitle={sheet && me ? undefined : INVITE_SUBTITLE}
      >
        {sheet && me ? (
          <GuestForm
            key={sheet === 'new' ? 'new' : sheet.id}
            roomId={roomId}
            guest={sheet === 'new' ? null : sheet}
            onClose={() => setSheet(null)}
          />
        ) : (
          <InviteOptions
            roomId={roomId}
            onAddGuest={() => {
              setInviteOpen(false);
              setSheet('new');
            }}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}
