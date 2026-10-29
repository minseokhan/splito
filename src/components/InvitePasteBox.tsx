import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { extractInviteToken } from '@/lib/invite';
import { savePendingInvite } from '@/services/pendingInvite';

const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? 'splito-trip.vercel.app';

type Props = { onSaved?: () => void };

// 앱 미설치 경로의 초대 복원(ADR-008). 클립보드는 사용자가 버튼을 눌렀을 때만 읽는다.
export function InvitePasteBox({ onSaved }: Props) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<'found' | 'missing'>();

  const tryText = async (input: string) => {
    const token = extractInviteToken(input, LINK_DOMAIN);
    if (!token) return setResult('missing');
    await savePendingInvite(token);
    setResult('found');
    onSaved?.();
  };

  return (
    <View className="gap-2">
      <Text className="font-semibold text-[15px] text-ink-900">초대받으셨나요?</Text>
      {/* iOS 16+: UIPasteControl이라 붙여넣기 권한 팝업이 없다. */}
      {Clipboard.isPasteButtonAvailable ? (
        <Clipboard.ClipboardPasteButton
          acceptedContentTypes={['plain-text', 'url']}
          displayMode="iconAndLabel"
          style={{ height: 44, width: '100%' }}
          onPress={(data) => (data.type === 'text' ? tryText(data.text) : setResult('missing'))}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={async () => tryText(await Clipboard.getStringAsync())}
          className="h-11 items-center justify-center rounded-lg bg-sky-200"
        >
          <Text className="font-semibold text-[15px] text-ink-900">초대 링크 붙여넣기</Text>
        </Pressable>
      )}
      <View className="flex-row gap-2">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="초대 링크 붙여넣기"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="초대 링크 입력"
          className="h-12 flex-1 rounded-lg border border-input-line bg-white px-4 text-base text-ink-900 focus:border-sky-800 focus:bg-sky-100"
        />
        <Pressable
          accessibilityRole="button"
          disabled={!text.trim()}
          onPress={() => tryText(text)}
          className={`h-12 justify-center px-3 ${text.trim() ? '' : 'opacity-40'}`}
        >
          <Text className="font-medium text-[15px] text-sky-900">확인</Text>
        </Pressable>
      </View>
      {result === 'found' && (
        <Text className="text-[13px] text-plus">초대를 확인했어요. 로그인하면 참여할 수 있어요</Text>
      )}
      {result === 'missing' && <Text className="text-[13px] text-minus">초대 링크를 찾지 못했어요</Text>}
    </View>
  );
}
