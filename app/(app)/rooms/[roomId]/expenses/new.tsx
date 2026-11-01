import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Camera, EditPencil, MediaImage, MessageText, Microphone, NavArrowRight } from 'iconoir-react-native';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { ParsingState } from '@/components/ParsingState';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/hooks/useAuth';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { toUserError, type UserError } from '@/lib/errors';
import { draftFromParse, emptyDraft, type ExpenseDraft, type ParseResult } from '@/lib/expenseForm';
import { autoSelectPayer } from '@/lib/pool';
import { uuidV4 } from '@/lib/uuid';
import { api } from '@/services/api';
import { keepPhoto, saveDraft } from '@/services/drafts';
import { preparePhoto, uploadReceipt } from '@/services/storage';
import { colors } from '@/theme/tokens';
import type { ExpenseSource } from '@/types/domain';

const TEXT_LIMIT = 4000;
const VOICE_LIMIT_MS = 60_000;

type InputMethod = 'photo' | 'text' | 'voice' | 'manual';
type PhotoKind = 'receipt' | 'capture';
type Phase = { kind: 'input' } | { kind: 'parsing' } | { kind: 'failed'; error: UserError; canRetry: boolean };

// 기기 현지 날짜(음성·직접 입력은 기록한 날이 결제일).
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const codeError = (code: string) => toUserError({ message: code });

export default function NewExpense() {
  const params = useLocalSearchParams<{ roomId: string; method?: InputMethod }>();
  const roomId = params.roomId;
  // method 없이 열리면 방법 선택 화면을 먼저 보여준다.
  const [picked, setPicked] = useState<InputMethod | undefined>(undefined);
  const method = params.method ?? picked;
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

  if (!method) return <MethodPicker onSelect={setPicked} />;

  const me = members?.find((m) => m.userId === session?.user.id && !m.leftAt);
  if (!room || !members || !me || profile === undefined) return null;

  const ctx = (source: ExpenseSource) => ({
    expenseId,
    roomId,
    source,
    meMemberId: me.id,
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

  // 방법 선택 화면에서 고른 경우에만 뒤로가기가 방법 선택으로 돌아간다.
  const backToPicker = picked
    ? () => {
        cancel();
        setPicked(undefined);
      }
    : undefined;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <BottomSheet visible={needNotice} onClose={() => router.back()} title="사진·텍스트가 인식을 위해 Anthropic(미국)으로 전송돼요" subtitle="인식에만 쓰고, 원하지 않으면 직접 입력할 수 있어요.">
        <View className="gap-2.5">
          <PrimaryButton title="확인" onPress={() => void ackNotice()} />
          <PrimaryButton title="직접 입력할게요" variant="muted" onPress={manual} />
        </View>
      </BottomSheet>

      <NavBar close={!picked} onBack={backToPicker} />

      {phase.kind === 'parsing' && (
        <ParsingState state="parsing" label={method === 'photo' ? '영수증을 읽고 있어요' : '결제 내용을 읽고 있어요'} onCancel={cancel} />
      )}

      {phase.kind === 'failed' && (
        <ParsingState
          state="failed"
          error={phase.error}
          onRetry={phase.canRetry ? retry : undefined}
          onManual={manual}
          onOpenSettings={phase.error.code === 'PERMISSION_DENIED' ? () => void Linking.openSettings() : undefined}
        />
      )}

      {phase.kind === 'input' && method === 'photo' && (
        <View className="flex-1">
          <View className="gap-6 px-5 pt-2">
            <Title title="사진으로 올리기" sub="영수증이나 결제앱 화면을 찍어주세요" />
            <View className="gap-2">
              <Text className="font-semibold text-sm text-ink-500">사진 종류</Text>
              <View className="flex-row gap-2">
                {(['receipt', 'capture'] as const).map((k) => {
                  const on = photoKind === k;
                  return (
                    <Pressable
                      key={k}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setPhotoKind(k)}
                      className={`h-11 flex-1 items-center justify-center rounded-input border-[1.5px] ${on ? 'border-primary bg-sky-50' : 'border-line bg-white'}`}
                    >
                      <Text className={`font-semibold text-base ${on ? 'text-primary-text' : 'text-ink-500'}`}>
                        {k === 'receipt' ? '영수증' : '결제앱 캡처'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
          <BottomBar>
            <PrimaryButton title="촬영하기" icon={Camera} onPress={() => void pickPhoto('camera')} />
            <PrimaryButton title="앨범에서 고르기" icon={MediaImage} variant="muted" onPress={() => void pickPhoto('library')} />
          </BottomBar>
        </View>
      )}

      {phase.kind === 'input' && (method === 'text' || method === 'voice') && (
        <View className="flex-1">
          <View className="flex-1 gap-6 px-5 pt-2">
            <Title
              title={method === 'text' ? '카드 문자 붙여넣기' : '말로 입력'}
              sub={
                method === 'text'
                  ? '카드 승인 문자를 그대로 붙여넣어 주세요'
                  : listening
                    ? '듣고 있어요. 다 말했으면 멈춰 주세요(최대 60초)'
                    : '예: 카레 1만 1천 원, 덮밥 1만 5천 원'
              }
            />
            <View className="gap-2">
              <Text className="font-semibold text-sm text-ink-500">{method === 'text' ? '승인 문자' : '인식된 내용'}</Text>
              <TextInput
                multiline
                value={text}
                onChangeText={setText}
                editable={!listening}
                maxLength={TEXT_LIMIT}
                placeholder={method === 'text' ? '카드 승인 문자를 붙여넣어 주세요' : '말한 내용이 여기에 표시돼요'}
                placeholderTextColor={colors.ink[300]}
                accessibilityLabel={method === 'text' ? '카드 승인 문자' : '음성 인식 결과'}
                textAlignVertical="top"
                className="min-h-40 rounded-input border-[1.5px] border-line bg-white p-4 text-[17px] text-ink focus:border-primary"
              />
              <Text className="self-end text-sm text-ink-400">
                {text.length.toLocaleString()}/{TEXT_LIMIT.toLocaleString()}
              </Text>
            </View>
          </View>
          <BottomBar>
            {method === 'voice' && (
              <PrimaryButton
                title={listening ? '멈추기' : text ? '다시 말하기' : '말하기 시작'}
                icon={Microphone}
                variant="muted"
                onPress={() => (listening ? ExpoSpeechRecognitionModule.stop() : void startVoice())}
              />
            )}
            <PrimaryButton title="인식하기" onPress={parseText} disabled={listening || !text.trim()} />
          </BottomBar>
        </View>
      )}
    </SafeAreaView>
  );
}

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <View className="gap-1.5">
      <Text className="font-semibold text-[26px] text-ink">
        {title}
      </Text>
      <Text className="text-[17px] text-ink-500">{sub}</Text>
    </View>
  );
}

// 칸마다 배경·아이콘 색이 다르다(시안 6): 문자 민트 / 음성 옐로 / 직접 회색.
const SUB_METHODS: { method: InputMethod; label: string; a11y: string; icon: typeof Camera; bg: string; iconColor: string }[] = [
  { method: 'text', label: '카드 문자\n붙여넣기', a11y: '카드 문자 붙여넣기로 지출 추가', icon: MessageText, bg: 'bg-success-bg', iconColor: colors.success.DEFAULT },
  { method: 'voice', label: '말로\n입력', a11y: '음성으로 지출 추가', icon: Microphone, bg: 'bg-warning-bg', iconColor: colors.warning.DEFAULT },
  { method: 'manual', label: '직접\n입력', a11y: '직접 입력으로 지출 추가', icon: EditPencil, bg: 'bg-app', iconColor: colors.primary.text },
];

// 시안 6: 지출 올리기 방법 선택(전체 화면).
function MethodPicker({ onSelect }: { onSelect: (m: InputMethod) => void }) {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <NavBar close />
      <ScrollView contentContainerClassName="gap-6 px-5 pb-10 pt-2">
        <View className="gap-1.5">
          <Text className="font-semibold text-[26px] text-ink">
            어떻게 올릴까요?
          </Text>
          <Text className="text-[17px] text-ink-500">AI가 품목별로 나누고 결제일 환율로 바꿔드려요</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="영수증 사진으로 지출 추가"
          onPress={() => onSelect('photo')}
          className="flex-row items-center gap-4 rounded-card-lg bg-primary p-[22px] active:bg-primary-press"
        >
          <View className="h-14 w-14 items-center justify-center rounded-[18px] bg-white">
            <Icon as={Camera} size={28} color={colors.primary.text} />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-xl text-primary-on">영수증 찍기</Text>
            <Text className="mt-[3px] text-[15px] text-primary-on">사진 한 장이면 품목·번역까지</Text>
          </View>
          <Icon as={NavArrowRight} size={22} color={colors.primary.on} />
        </Pressable>

        <View className="flex-row gap-2.5">
          {SUB_METHODS.map((m) => (
            <Pressable
              key={m.method}
              accessibilityRole="button"
              accessibilityLabel={m.a11y}
              onPress={() => onSelect(m.method)}
              className={`flex-1 items-start gap-2.5 rounded-card px-2.5 py-[18px] active:opacity-80 ${m.bg}`}
            >
              <Icon as={m.icon} size={24} color={m.iconColor} />
              <Text className="font-semibold text-[17px] text-ink">{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-1.5 gap-2.5">
          <Text className="font-semibold text-sm text-ink-500">말로 입력 예시</Text>
          <View style={{ borderStyle: 'dashed' }} className="rounded-button border-[1.5px] border-sky-200 px-4 py-3.5">
            <Text className="text-[17px] text-primary-on">“카레 1만 1천 원, 덮밥 1만 5천 원, 닭꼬치 6천 원”</Text>
            <Text className="mt-1 text-sm text-ink-400">→ 품목 박스 3개가 만들어져요</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ManualRedirect({ onReady }: { onReady: () => void }) {
  const once = useRef(onReady);
  useEffect(() => once.current(), []);
  return null;
}
