import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { useRoom } from '@/hooks/useRooms';
import { buildInviteUrl } from '@/lib/invite';
import { colors } from '@/theme/tokens';

const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? 'splito-trip.vercel.app';

export default function Invite() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { data: room } = useRoom(roomId);
  const [copied, setCopied] = useState(false);
  if (!room) return null;
  const url = buildInviteUrl(LINK_DOMAIN, room.invite_token);

  // 카카오톡 공유는 OS 공유 시트로 한다(Kakao 공유 SDK는 P1).
  const share = () => Share.share({ message: `스플리토 여행 "${room.name}"에 초대해요\n${url}` });
  const copy = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
  };

  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-1 items-center gap-4 pt-6">
        <Text className="self-start font-bold text-[22px] text-ink-900">동행 초대하기</Text>
        <Text className="self-start text-[15px] text-ink-700">QR을 보여주거나 링크를 보내세요</Text>
        <View className="mt-4 rounded-xl border border-line p-4" accessibilityLabel="초대 QR 코드">
          <QRCode value={url} size={200} color={colors.ink[900]} />
        </View>
        <Text className="text-[13px] text-ink-500" selectable>
          {url}
        </Text>
      </View>
      <View className="gap-2 pb-4">
        {copied && <Text className="text-center text-[13px] text-ink-500">링크를 복사했어요</Text>}
        <PrimaryButton title="카카오톡 공유" onPress={share} />
        <Pressable
          accessibilityRole="button"
          onPress={copy}
          className="h-14 items-center justify-center rounded-xl bg-sky-200"
        >
          <Text className="font-semibold text-base text-ink-900">링크 복사</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
