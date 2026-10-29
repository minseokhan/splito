import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import type { InputMethod } from '@/components/InputMethodSheet';
import { ParsingState } from '@/components/ParsingState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { toUserError, type UserError } from '@/lib/errors';
import { draftFromParse, emptyDraft, type ExpenseDraft, type ParseResult } from '@/lib/expenseForm';
import { autoSelectPayer } from '@/lib/pool';
import { uuidV4 } from '@/lib/uuid';
import { api } from '@/services/api';
import { keepPhoto, saveDraft } from '@/services/drafts';
import { preparePhoto, uploadReceipt } from '@/services/storage';
import type { ExpenseSource } from '@/types/domain';

const TEXT_LIMIT = 4000;
const VOICE_LIMIT_MS = 60_000;

type PhotoKind = 'receipt' | 'capture';
type Phase = { kind: 'input' } | { kind: 'parsing' } | { kind: 'failed'; error: UserError; canRetry: boolean };

// 기기 현지 날짜(음성·직접 입력은 기록한 날이 결제일).
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const codeError = (code: string) => toUserError({ message: code });

export default function NewExpense() {
  const { roomId, method } = useLocalSearchParams<{ roomId: string; method: InputMethod }>();
  const { session, profile, refreshProfile } = useAuth();
  const { data: room } = useRoom(roomId);
  const { data: members } = useRoomMembers(roomId);

  const [expenseId] = useState(uuidV4);
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [noticeDone, setNoticeDone] = useState(false);
  const [photoKind, setPhotoKind] = useState<PhotoKind>('receipt');
  // 업로드가 끝난 사진은 다시 시도할 때 재사용한다.
  const [photo, setPhoto] = useState<{ local: string; storagePath: string | null } | null>(null);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const finalText = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) finalText.current = `${finalText.current} ${t}`.trim();
    setText(e.isFinal ? finalText.current : `${finalText.current} ${t}`.trim());
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false);
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    const code = e.error === 'not-allowed' ? 'PERMISSION_DENIED' : 'STT_UNAVAILABLE';
    setPhase({ kind: 'failed', error: codeError(code), canRetry: false });
  });

  // 최대 60초 후 자동으로 멈춘다. 화면을 떠나면 인식을 끊는다.
  useEffect(() => {
    if (!listening) return;
    const t = setTimeout(() => ExpoSpeechRecognitionModule.stop(), VOICE_LIMIT_MS);
    return () => clearTimeout(t);
  }, [listening]);
  useEffect(() => () => ExpoSpeechRecognitionModule.abort(), []);

  const me = members?.find((m) => m.userId === session?.user.id && !m.leftAt);
  if (!room || !members || !me || profile === undefined) return null;

  const ctx = (source: ExpenseSource) => ({
    expenseId,
    roomId,
    source,
    meMemberId: me.id,
    activeMemberIds: members.filter((m) => !m.leftAt).map((m) => m.id),
    todayLocal: localToday(),
    newId: uuidV4,
  });

  const goReview = async (draft: ExpenseDraft, localPhotos: string[]) => {
    await saveDraft(roomId, { draft, localPhotos }); // review가 기기에서 다시 읽는다
    router.replace({ pathname: '/rooms/[roomId]/expenses/review', params: { roomId } });
  };

  const photoSource: ExpenseSource = photoKind === 'capture' ? 'card_image' : 'receipt';
  const photos = (p: typeof photo) => (p?.storagePath ? [{ storagePath: p.storagePath, kind: photoKind }] : []);

  const manual = () => {
    const source: ExpenseSource = method === 'photo' ? photoSource : method === 'text' ? 'card_text' : method === 'voice' ? 'voice' : 'manual';
    const draft = emptyDraft({ ...ctx(source), currency: room.base_currency });
    void goReview({ ...draft, photos: photos(photo) }, photo ? [photo.local] : []);
  };

  // 인식·업로드에 실패해도 사진은 작성 중 지출로 남긴다.
  const keepFailedPhoto = (p: NonNullable<typeof photo>) => {
    const draft = emptyDraft({ ...ctx(photoSource), currency: room.base_currency });
    return saveDraft(roomId, { draft: { ...draft, photos: photos(p) }, localPhotos: [p.local] });
  };

  const parse = async (req: { kind: 'image'; storagePath: string } | { kind: 'text'; text: string }, source: ExpenseSource, p: typeof photo) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'parsing' });
    let result: ParseResult;
    try {
      result = await api.parseExpense(
        { roomId, baseCurrency: room.base_currency, roomStartDate: room.start_date ?? undefined, ...req },
        controller.signal,
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      const error = err as UserError;
      setPhase({ kind: 'failed', error, canRetry: error.code !== 'AI_QUOTA_EXCEEDED' });
      if (p) await keepFailedPhoto(p);
      return;
    }
    if (controller.signal.aborted) return;
    // 공금 카드 끝자리와 일치하면 결제자를 '공금'으로(J7 2번).
    const draft = autoSelectPayer(draftFromParse(result, ctx(source)), { enabled: room.pool_enabled, cardLast4: room.pool_card_last4 });
    await goReview({ ...draft, photos: photos(p) }, p ? [p.local] : []);
  };

  const uploadAndParse = async (p: { local: string; storagePath: string | null }) => {
    let next = p;
    if (!next.storagePath) {
      setPhase({ kind: 'parsing' });
      try {
        next = { ...p, storagePath: await uploadReceipt(roomId, expenseId, p.local) };
      } catch (err) {
        setPhase({ kind: 'failed', error: err as UserError, canRetry: true });
        await keepFailedPhoto(p);
        return;
      }
      setPhoto(next);
    }
    await parse({ kind: 'image', storagePath: next.storagePath! }, photoSource, next);
  };

  const pickPhoto = async (from: 'camera' | 'library') => {
    const perm =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhase({ kind: 'failed', error: codeError('PERMISSION_DENIED'), canRetry: false });
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], exif: false, quality: 1 };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    // EXIF를 지운 사본을 기기에 보관한다(앱이 종료돼도 이어 쓰기).
    const { uri } = await preparePhoto(res.assets[0].uri);
    const p = { local: await keepPhoto(roomId, uri), storagePath: null };
    setPhoto(p);
    await uploadAndParse(p);
  };

  const startVoice = async () => {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setPhase({ kind: 'failed', error: codeError('STT_UNAVAILABLE'), canRetry: false });
      return;
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setPhase({ kind: 'failed', error: codeError('PERMISSION_DENIED'), canRetry: false });
      return;
    }
    finalText.current = '';
    setText('');
    setListening(true);
    // 기기 STT만 쓴다. 음성 파일은 서버로 보내지 않는다(ADR-004).
    ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
  };

  const parseText = () => void parse({ kind: 'text', text: text.trim() }, method === 'voice' ? 'voice' : 'card_text', null);

  const retry = () => {
    if (photo) void uploadAndParse(photo);
    else if (text.trim()) parseText();
    else setPhase({ kind: 'input' });
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase({ kind: 'input' });
  };

  if (method === 'manual') {
    // 렌더 중 이동을 피하려고 버튼 대신 즉시 실행한다.
    return <ManualRedirect onReady={manual} />;
  }

  const needNotice = !profile?.ai_notice_ack_at && !noticeDone;
  const ackNotice = async () => {
    setNoticeDone(true);
    await api.ackAiNotice().catch(() => undefined); // 실패해도 다음에 다시 묻는 것뿐이다
    await refreshProfile().catch(() => undefined);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <BottomSheet visible={needNotice} onClose={() => router.back()}>
        <Text className="font-semibold text-[17px] text-ink-900">사진·텍스트가 인식을 위해 Anthropic(미국)으로 전송돼요</Text>
        <Text className="mt-2 text-[13px] text-ink-500">인식에만 쓰고, 원하지 않으면 직접 입력할 수 있어요.</Text>
        <View className="mt-6 gap-2">
          <PrimaryButton title="확인" onPress={() => void ackNotice()} />
          <SecondaryButton title="직접 입력할게요" onPress={manual} />
        </View>
      </BottomSheet>

      {phase.kind === 'parsing' && (
        <ParsingState state="parsing" label={method === 'photo' ? '영수증을 읽고 있어요' : '결제 내용을 읽고 있어요'} onCancel={cancel} />
      )}

      {phase.kind === 'failed' && (
        <View className="flex-1">
          <ParsingState state="failed" error={phase.error} onRetry={phase.canRetry ? retry : undefined} onManual={manual} />
          {phase.error.code === 'PERMISSION_DENIED' && (
            <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} className="mb-4 h-11 items-center justify-center">
              <Text className="font-medium text-[15px] text-sky-900">설정 열기</Text>
            </Pressable>
          )}
        </View>
      )}

      {phase.kind === 'input' && method === 'photo' && (
        <View className="flex-1 justify-between px-5 pb-4 pt-6">
          <View className="gap-4">
            <Text className="font-bold text-[22px] text-ink-900">사진으로 추가</Text>
            <View className="flex-row gap-2">
              {(['receipt', 'capture'] as const).map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: photoKind === k }}
                  onPress={() => setPhotoKind(k)}
                  className={`h-11 flex-1 items-center justify-center rounded-md ${photoKind === k ? 'bg-sky-300' : 'bg-sky-100'}`}
                >
                  <Text className="font-semibold text-[15px] text-ink-900">{k === 'receipt' ? '영수증' : '결제앱 캡처'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View className="gap-2">
            <PrimaryButton title="촬영하기" onPress={() => void pickPhoto('camera')} />
            <SecondaryButton title="앨범에서 고르기" onPress={() => void pickPhoto('library')} />
          </View>
        </View>
      )}

      {phase.kind === 'input' && (method === 'text' || method === 'voice') && (
        <View className="flex-1 justify-between px-5 pb-4 pt-6">
          <View className="flex-1 gap-4">
            <Text className="font-bold text-[22px] text-ink-900">{method === 'text' ? '문자 붙여넣기' : '음성으로 추가'}</Text>
            {method === 'voice' && (
              <Text className="text-[13px] text-ink-500">
                {listening ? '듣고 있어요. 다 말했으면 멈춰 주세요(최대 60초)' : '예: 카레 1만 1천 원, 덮밥 1만 5천 원'}
              </Text>
            )}
            <TextInput
              multiline
              value={text}
              onChangeText={setText}
              editable={!listening}
              maxLength={TEXT_LIMIT}
              placeholder={method === 'text' ? '카드 승인 문자를 붙여넣어 주세요' : '말한 내용이 여기에 표시돼요'}
              accessibilityLabel={method === 'text' ? '카드 승인 문자' : '음성 인식 결과'}
              textAlignVertical="top"
              className="min-h-40 rounded-lg border border-input-line bg-white p-4 text-base text-ink-900 focus:border-sky-800 focus:bg-sky-100"
            />
            <Text className="self-end text-[13px] text-ink-500">
              {text.length.toLocaleString()}/{TEXT_LIMIT.toLocaleString()}
            </Text>
          </View>
          <View className="gap-2">
            {method === 'voice' && (
              <SecondaryButton
                title={listening ? '멈추기' : text ? '다시 말하기' : '말하기 시작'}
                onPress={() => (listening ? ExpoSpeechRecognitionModule.stop() : void startVoice())}
              />
            )}
            <PrimaryButton title="인식하기" onPress={parseText} disabled={listening || !text.trim()} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="h-14 items-center justify-center rounded-xl bg-sky-200">
      <Text className="font-semibold text-base text-ink-900">{title}</Text>
    </Pressable>
  );
}

function ManualRedirect({ onReady }: { onReady: () => void }) {
  const once = useRef(onReady);
  useEffect(() => once.current(), []);
  return null;
}
