import * as Clipboard from 'expo-clipboard';
import { Copy } from 'iconoir-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { extractInviteToken } from '@/lib/invite';
import { savePendingInvite } from '@/services/pendingInvite';

import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

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
    <View className="gap-2.5">
      <View className="gap-1">
        <Text className="font-semibold text-base text-ink">초대받으셨나요?</Text>
        <Text className="text-[13px] text-ink-400">받은 초대 링크를 붙여넣으면 바로 참여할 수 있어요</Text>
      </View>
      {/* iOS 16+: UIPasteControl이라 붙여넣기 권한 팝업이 없다. */}
      {Clipboard.isPasteButtonAvailable ? (
        <Clipboard.ClipboardPasteButton
          acceptedContentTypes={['plain-text', 'url']}
          displayMode="iconAndLabel"
          style={{ height: 52, width: '100%' }}
          onPress={(data) => (data.type === 'text' ? tryText(data.text) : setResult('missing'))}
        />
      ) : (
        <PrimaryButton title="초대 링크 붙여넣기" variant="sky" size="md" icon={Copy} onPress={async () => tryText(await Clipboard.getStringAsync())} />
      )}
      <TextField
        value={text}
        onChangeText={setText}
        placeholder="초대 링크 직접 입력"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="초대 링크 입력"
        right={
          <Pressable accessibilityRole="button" disabled={!text.trim()} onPress={() => tryText(text)} hitSlop={8}>
            <Text className={`font-semibold text-base ${text.trim() ? 'text-primary-text' : 'text-ink-300'}`}>확인</Text>
          </Pressable>
        }
      />
      {result === 'found' && <Text className="text-[13px] text-success">초대를 확인했어요. 로그인하면 참여할 수 있어요</Text>}
      {result === 'missing' && <Text className="text-[13px] text-danger">초대 링크를 찾지 못했어요</Text>}
    </View>
  );
}
