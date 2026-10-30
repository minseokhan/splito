import * as Application from 'expo-application';
import { router } from 'expo-router';
import { Bank, LogOut, Mail, NavArrowRight, Page, ShieldCheck } from 'iconoir-react-native';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useMyPayoutAccount } from '@/hooks/usePayoutAccount';
import { toUserError } from '@/lib/errors';
import { nicknameSchema } from '@/lib/profile';
import { signOut, updateMarketing, updateNickname } from '@/services/auth';
import { colors } from '@/theme/tokens';

const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? 'splito-trip.vercel.app';

type RowProps = { icon: ComponentType<SvgProps>; label: string; value?: string; onPress?: () => void; right?: ReactNode };

function Row({ icon, label, value, onPress, right }: RowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      className="flex-row items-center gap-3 px-5 py-4 active:bg-app"
    >
      <Icon as={icon} size={22} color={colors.ink[500]} />
      <Text className="flex-1 font-semibold text-base text-ink">{label}</Text>
      {value && <Text className="text-sm text-ink-400">{value}</Text>}
      {right !== undefined ? right : onPress && <Icon as={NavArrowRight} size={18} color={colors.ink[300]} />}
    </Pressable>
  );
}

// 토글 46×28. 지금은 표시만 한다(마케팅 동의만 바꾸는 서비스 함수가 없음).
function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={() => onChange(!on)}
      hitSlop={8}
      className={`h-7 w-[46px] rounded-full p-[3px] ${on ? 'items-end bg-primary' : 'items-start bg-line'}`}
    >
      <View className="h-[22px] w-[22px] rounded-full bg-white" style={{ boxShadow: '0 1px 3px rgba(19,25,39,.2)' }} />
    </Pressable>
  );
}

export default function Settings() {
  const { session, profile, refreshProfile } = useAuth();
  const { data: account } = useMyPayoutAccount();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [marketing, setMarketing] = useState<boolean>();
  const marketingOn = marketing ?? !!profile?.marketing_opt_in;
  const toggleMarketing = async (on: boolean) => {
    setMarketing(on);
    try {
      await updateMarketing(on);
      await refreshProfile();
      toast(on ? '마케팅 정보 수신에 동의했어요' : '마케팅 정보 수신을 껐어요');
    } catch (e) {
      setMarketing(!on);
      toast(toUserError(e).message);
    }
  };

  const name = profile?.nickname ?? '';
  const naver = session?.user.app_metadata.provider === 'custom:naver';

  const openEdit = () => {
    setNickname(name);
    setError(undefined);
    setEditOpen(true);
  };
  const saveNickname = async () => {
    setSaving(true);
    try {
      await updateNickname(nickname);
      await refreshProfile();
      setEditOpen(false);
      toast('닉네임을 바꿨어요');
    } catch (e) {
      setError(toUserError(e).message);
    } finally {
      setSaving(false);
    }
  };
  const logout = async () => {
    await signOut().catch(() => undefined);
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-app">
      <NavBar title="내 정보" />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-2">
        <View className="flex-row items-center gap-3.5 rounded-[22px] bg-white p-5">
          <View className="h-[60px] w-[60px] items-center justify-center rounded-full bg-sky-100">
            <Text className="font-extrabold text-[22px] text-primary-text">{name.slice(0, 1)}</Text>
          </View>
          <View className="flex-1 gap-1">
            <Text className="font-bold text-[19px] text-ink" numberOfLines={1}>
              {name}
            </Text>
            <View className="flex-row items-center gap-1.5">
              <View className={`h-4 w-4 rounded-[5px] ${naver ? 'bg-naver' : 'bg-kakao'}`} />
              <Text className="text-[13px] text-ink-400">{naver ? '네이버로 로그인' : '카카오로 로그인'}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={openEdit} hitSlop={8}>
            <Text className="font-bold text-sm text-primary-text">닉네임 수정</Text>
          </Pressable>
        </View>

        <View className="overflow-hidden rounded-[22px] bg-white py-1">
          <Row
            icon={Bank}
            label="받을 계좌"
            value={account ? `${account.bankName} ${account.accountLast4}` : '등록하기'}
            onPress={() => router.push('/payout-account')}
          />
          <Row icon={Page} label="이용약관" onPress={() => Linking.openURL(`https://${LINK_DOMAIN}/terms`)} />
          <Row icon={ShieldCheck} label="개인정보 처리방침" onPress={() => Linking.openURL(`https://${LINK_DOMAIN}/privacy`)} />
          <Row icon={Mail} label="마케팅 정보 수신" right={<Toggle on={marketingOn} label="마케팅 정보 수신" onChange={(on) => void toggleMarketing(on)} />} />
        </View>

        <View className="overflow-hidden rounded-[22px] bg-white py-1">
          <Row icon={LogOut} label="로그아웃" onPress={logout} right={null} />
        </View>

        <Text className="text-center text-xs text-ink-300">버전 {Application.nativeApplicationVersion ?? '-'}</Text>
      </ScrollView>

      <BottomSheet visible={editOpen} onClose={() => setEditOpen(false)} title="닉네임 수정">
        <TextField
          accessibilityLabel="닉네임"
          value={nickname}
          onChangeText={setNickname}
          maxLength={12}
          placeholder="1~12자"
          autoFocus
          right={<Text className="font-medium text-[13px] text-ink-400">{`${nickname.length}/12`}</Text>}
        />
        {error && <Text className="text-[13px] text-danger">{error}</Text>}
        <PrimaryButton title="저장" disabled={!nicknameSchema.safeParse(nickname).success} loading={saving} onPress={saveNickname} />
      </BottomSheet>
    </SafeAreaView>
  );
}
