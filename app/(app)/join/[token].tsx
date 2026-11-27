import { router, useLocalSearchParams } from 'expo-router';
import { Airplane, Check } from 'iconoir-react-native';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { roomPeriod } from '@/components/RoomCard';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useInvitePreview, useJoinRoom, useResolveInviteCode } from '@/hooks/useRooms';
import type { UserError } from '@/lib/errors';
import { currencyFlag } from '@/lib/flag';
import { normalizeInviteCode } from '@/lib/invite';
import { signOut } from '@/services/auth';
import { clearPendingInvite, savePendingInvite } from '@/services/pendingInvite';
import { colors } from '@/theme/tokens';

const EXPIRED = '초대가 만료됐어요. 방장에게 다시 요청해 주세요.';
// 홈 [초대받은 여행 참여하기]는 /join/code로 연다. 토큰은 22자라 겹치지 않는다.
const JOIN_CODE = 'code';
const AVATAR_MAX = 5;

// 합류 확인 시트(J2): ① 초대 확인 → ③ 나 고르기(게스트가 있으면) → 참여. 시트 없이 자동 합류하지 않는다(잘못 누른 링크 방지).
// 참여 코드 입력도 같은 시트에서 받는다 — 시트를 바꿔 띄우면 iOS가 닫히는 중인 모달 위 새 모달을 무시한다.
export default function JoinSheet() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const byCode = token === JOIN_CODE;
  const preview = useInvitePreview(token, !byCode);
  const join = useJoinRoom();
  const toast = useToast();
  const { profile } = useAuth();
  const [step, setStep] = useState<'confirm' | 'pick'>('confirm');
  const [guestId, setGuestId] = useState<string>();
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

  const submit = (guestMemberId?: string) =>
    join.mutate(
      { token, guestMemberId },
      {
        onSuccess: (roomId) => {
          clearPendingInvite().catch(() => undefined);
          toast(`${p?.roomName ?? ''} 여행에 참여했어요`);
          goRoom(roomId);
        },
      },
    );

  // 다른 계정으로 참여: 초대를 보관해 두고 로그아웃 → 다시 로그인하면 이 시트로 돌아온다.
  const switchAccount = async () => {
    await savePendingInvite(token).catch(() => undefined);
    await signOut().catch(() => undefined);
    router.replace('/(auth)/login');
  };

  if (alreadyRoomId) return null;
  const p = preview.data;
  const flag = p ? currencyFlag(p.baseCurrency) : null;
  const meta = p ? [roomPeriod(p), `${p.memberCount}명 참여 중`, p.expenseCount > 0 ? `지출 ${p.expenseCount}건 기록됨` : null] : [];

  return (
    <View className="flex-1 justify-end bg-[rgba(19,25,39,0.45)]">
      <SafeAreaView edges={['bottom']} className="gap-[18px] rounded-t-sheet bg-white px-5 pb-4 pt-3">
        <View className="h-[5px] w-10 self-center rounded-full bg-line" />
        {byCode ? (
          <CodeEntry onResolved={(t) => router.setParams({ token: t })} onClose={close} />
        ) : invalid ? (
          <Text className="text-base text-ink-700">{EXPIRED}</Text>
        ) : p && step === 'pick' ? (
          <View className="gap-3">
            <View className="gap-1">
              <Text className="font-semibold text-xl text-ink">이 중에 누구세요?</Text>
              <Text className="text-sm text-ink-500">고르면 그분의 지출과 정산이 내 계정으로 이어져요</Text>
            </View>
            <View className="gap-2">
              {p.guests.map((g, i) => {
                const on = g.memberId === guestId;
                return (
                  <Pressable
                    key={g.memberId}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setGuestId(g.memberId)}
                    className={`min-h-[56px] flex-row items-center gap-3 rounded-button border px-3.5 ${on ? 'border-primary-text bg-sky-50' : 'border-line bg-white active:bg-app'}`}
                  >
                    <Avatar name={g.name} colorIndex={i + 1} guest size={36} />
                    <Text className="flex-1 font-semibold text-base text-ink">{g.name}</Text>
                    {on && <Icon as={Check} size={20} color={colors.primary.text} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : p ? (
          <View className="gap-4">
            <View className="flex-row items-center gap-3.5">
              <View className="h-[52px] w-[52px] items-center justify-center rounded-box bg-app">
                {flag ? <Text style={{ fontSize: 28, lineHeight: 34 }}>{flag}</Text> : <Icon as={Airplane} size={26} color={colors.primary.text} />}
              </View>
              <View className="flex-1 gap-1">
                <Text className="font-semibold text-xl text-ink">
                  {p.inviterNickname ? `${p.inviterNickname}님이 ${p.roomName} 여행에 초대했어요` : `${p.roomName} 여행에 참여할까요?`}
                </Text>
                <Text className="text-sm text-ink-500">{meta.filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            {p.members.length > 0 && (
              <View className="flex-row items-center">
                {p.members.slice(0, AVATAR_MAX).map((m, i) => (
                  <View key={i} style={{ marginLeft: i ? -8 : 0 }}>
                    <Avatar name={m.name} colorIndex={i} guest={m.guest} size={36} ring="#FFFFFF" />
                  </View>
                ))}
                {p.members.length > AVATAR_MAX && <Text className="ml-2 text-13 text-ink-500">+{p.members.length - AVATAR_MAX}</Text>}
              </View>
            )}
            {profile?.nickname ? (
              <View className="flex-row items-center justify-between rounded-input bg-app px-3.5 py-3">
                <Text className="flex-1 text-13 text-ink-500">{profile.nickname} 계정으로 참여해요</Text>
                <Pressable accessibilityRole="button" onPress={switchAccount} hitSlop={8}>
                  <Text className="font-semibold text-13 text-primary-text">계정 변경</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : error ? (
          <Text className="text-base text-ink-700">{error.message}</Text>
        ) : (
          <Text className="text-base text-ink-500">초대를 확인하고 있어요</Text>
        )}
        {!byCode && (
          <View className="gap-1">
            {error && !invalid && !p ? (
              <PrimaryButton title="다시 시도" onPress={() => preview.refetch()} />
            ) : !invalid ? (
              <>
                {join.error && <Text className="mb-2 text-center text-13 text-danger">{error?.message}</Text>}
                {step === 'pick' ? (
                  <View className="gap-2">
                    <PrimaryButton title="참여하기" onPress={() => submit(guestId)} loading={join.isPending} disabled={!guestId} />
                    <PrimaryButton title="새로 참여할게요" variant="muted" onPress={() => submit()} disabled={join.isPending} />
                  </View>
                ) : (
                  <PrimaryButton
                    title="참여하기"
                    onPress={() => (p?.guests.length ? setStep('pick') : submit())}
                    loading={join.isPending}
                    disabled={!p}
                  />
                )}
              </>
            ) : null}
            <Pressable accessibilityRole="button" onPress={close} className="h-11 items-center justify-center">
              <Text className="font-semibold text-base text-ink-500">{invalid ? '확인' : '나중에'}</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

// 참여 코드 6자리 입력(홈 [초대받은 여행 참여하기]). 코드가 맞으면 같은 시트가 초대 확인(①)으로 바뀐다.
function CodeEntry({ onResolved, onClose }: { onResolved: (token: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const resolve = useResolveInviteCode();
  const code = normalizeInviteCode(text);
  const err = resolve.error as UserError | null;
  const submit = () => code && resolve.mutate(code, { onSuccess: onResolved });
  return (
    <View className="gap-[18px]">
      <View className="gap-1">
        <Text className="font-semibold text-xl text-ink">초대받은 여행 참여하기</Text>
        <Text className="text-sm text-ink-500">동행에게 받은 참여 코드를 입력해 주세요.</Text>
      </View>
      <View className="gap-2">
        <TextField
          value={text}
          onChangeText={(v) => {
            setText(v);
            resolve.reset();
          }}
          placeholder="참여 코드 6자리"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={7}
          returnKeyType="go"
          onSubmitEditing={submit}
          invalid={!!err}
          accessibilityLabel="참여 코드 입력"
        />
        {err ? (
          <Text className="text-13 text-danger">{err.code === 'INVITE_INVALID' ? EXPIRED : err.message}</Text>
        ) : (
          <Text className="text-13 text-ink-400">초대 링크를 받았다면 링크를 누르면 바로 참여 화면이 열려요.</Text>
        )}
      </View>
      <View className="gap-1">
        <PrimaryButton title="참여하기" onPress={submit} loading={resolve.isPending} disabled={!code} />
        <Pressable accessibilityRole="button" onPress={onClose} className="h-11 items-center justify-center">
          <Text className="font-semibold text-base text-ink-500">나중에</Text>
        </Pressable>
      </View>
    </View>
  );
}
