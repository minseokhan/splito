import { router } from 'expo-router';
import { ChatBubble, NavArrowRight, QrCode, UserPlus } from 'iconoir-react-native';
import { useState, type ComponentType } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { SvgProps } from 'react-native-svg';

import { useRoom } from '@/hooks/useRooms';
import { buildInviteUrl } from '@/lib/invite';
import { colors } from '@/theme/tokens';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';

const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? 'splito-trip.vercel.app';

export const INVITE_TITLE = '동행 초대하기';
export const INVITE_SUBTITLE = '링크를 받은 사람은 바로 이 장부에 참여해요';

type Props = { roomId: string; onAddGuest?: () => void };

// 초대 2칸(카카오톡·QR) + 앱 없는 동행 추가. 시트와 초대 화면이 같이 쓴다.
export function InviteOptions({ roomId, onAddGuest }: Props) {
  const { data: room } = useRoom(roomId);
  const [qr, setQr] = useState(false);
  if (!room) return null;
  const url = buildInviteUrl(LINK_DOMAIN, room.invite_token);

  // 카카오톡 공유는 OS 공유 시트로 한다(Kakao 공유 SDK는 P1).
  const share = () => void Share.share({ message: `스플리토 여행 "${room.name}"에 초대해요\n${url}` });
  const addGuest = onAddGuest ?? (() => router.push({ pathname: '/rooms/[roomId]/members', params: { roomId, addGuest: '1' } }));

  return (
    <View className="gap-[18px]">
      <View className="flex-row gap-2.5">
        <Tile label="카카오톡" icon={ChatBubble} bg="bg-kakao" fg={colors.kakao.text} text="text-kakao-text" onPress={share} />
        <Tile label="QR 보기" icon={QrCode} bg="bg-app" fg={colors.primary.text} text="text-ink" onPress={() => setQr((v) => !v)} />
      </View>
      {qr && (
        <View className="items-center gap-2 rounded-[18px] bg-app p-4" accessibilityLabel="초대 QR 코드">
          <View className="rounded-input bg-white p-3">
            <QRCode value={url} size={180} color={colors.ink.DEFAULT} />
          </View>
          <Text className="text-xs text-ink-400" selectable>
            {url}
          </Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={addGuest}
        className="flex-row items-center gap-3 rounded-button border-[1.5px] border-line p-3.5 active:bg-app"
      >
        <Icon as={UserPlus} size={22} color={colors.primary.text} />
        <View className="flex-1 gap-0.5">
          <Text className="font-bold text-[15px] text-ink">앱 없는 동행 추가</Text>
          <Text className="text-xs text-ink-400">이름만으로 게스트를 추가해요</Text>
        </View>
        <Icon as={NavArrowRight} size={18} color={colors.ink[300]} />
      </Pressable>
    </View>
  );
}

type TileProps = { label: string; icon: ComponentType<SvgProps>; bg: string; fg: string; text: string; onPress: () => void };

function Tile({ label, icon, bg, fg, text, onPress }: TileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-1 items-center gap-2 rounded-[18px] px-2 py-4 active:translate-y-px ${bg}`}
    >
      <Icon as={icon} size={24} color={fg} />
      <Text className={`font-bold text-[13px] ${text}`}>{label}</Text>
    </Pressable>
  );
}

export function InviteSheet({ roomId, visible, onClose }: { roomId: string; visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={INVITE_TITLE} subtitle={INVITE_SUBTITLE}>
      <InviteOptions
        roomId={roomId}
        onAddGuest={() => {
          onClose();
          router.push({ pathname: '/rooms/[roomId]/members', params: { roomId, addGuest: '1' } });
        }}
      />
    </BottomSheet>
  );
}
