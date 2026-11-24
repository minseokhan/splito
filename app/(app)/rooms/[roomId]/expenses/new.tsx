import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Camera, EditPencil, MediaImage, MessageText, Microphone, NavArrowRight } from 'iconoir-react-native';
import { Keyboard, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { ParsingState } from '@/components/ParsingState';
import { PassSheet } from '@/components/PassSheets';
import { ScheduleChip } from '@/components/ScheduleChip';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useScheduleItems } from '@/hooks/useBooking';
import { useRoom, useRoomMembers, useRoomPass } from '@/hooks/useRooms';
import { toUserError, type UserError } from '@/lib/errors';
import { draftFromParse, emptyDraft, type ExpenseDraft, type ParseResult } from '@/lib/expenseForm';
import { DEMO_AI_USED, FREE_AI_LIMIT, type PassReason } from '@/lib/pass';
import { formatForeign } from '@/lib/money';
import { autoSelectPayer } from '@/lib/pool';
import { uuidV4 } from '@/lib/uuid';
import { api } from '@/services/api';
import { keepPhoto, loadDraft, saveDraft, type StoredDraft } from '@/services/drafts';
import { recognizeReceipt } from '@/services/ocr';
import { preparePhoto, uploadReceipt } from '@/services/storage';
import { colors } from '@/theme/tokens';
import type { ExpenseSource } from '@/types/domain';

const TEXT_LIMIT = 4000;

type InputMethod = 'photo' | 'text' | 'voice' | 'manual';
type PhotoKind = 'receipt' | 'capture';
type Phase = { kind: 'input' } | { kind: 'parsing' } | { kind: 'failed'; error: UserError; canRetry: boolean };

// 기기 현지 날짜(직접 입력은 기록한 날이 결제일).
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const codeError = (code: string) => toUserError({ message: code });


export default function NewExpense() {
  const params = useLocalSearchParams<{ roomId: string; method?: InputMethod; scheduleId?: string }>();
  const roomId = params.roomId;
  // 일정 카드의 [+ 지출]로 들어오면 저장 뒤 그 일정에 연결한다(명세 §7). review까지 들고 간다.
  const scheduleId = params.scheduleId;
  const { data: scheduleItems = [] } = useScheduleItems(roomId);
  const scheduleTitle = scheduleItems.find((x) => x.id === scheduleId)?.title;
  // method 없이 열리면 방법 선택 화면을 먼저 보여준다.
  const [picked, setPicked] = useState<InputMethod | undefined>(undefined);
  const method = params.method ?? picked;
  const { session, profile, refreshProfile } = useAuth();
  const { data: room } = useRoom(roomId);
  const { data: members } = useRoomMembers(roomId);
  const { data: passRec, isSuccess: passLoaded } = useRoomPass(roomId);

  const [expenseId] = useState(uuidV4);
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [noticeDone, setNoticeDone] = useState(false);
  // 업로드가 끝난 사진은 다시 시도할 때 재사용한다.
  const [photo, setPhoto] = useState<{ local: string; storagePath: string | null } | null>(null);
  const [text, setText] = useState('');
  const camRef = useRef<CameraView>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (!method)
    return (
      <MethodPicker
        // 음성으로 입력은 별도 화면이다. push라 뒤로가기가 방법 선택으로 돌아온다.
        onSelect={(m) =>
          m === 'voice'
            ? router.push({ pathname: '/rooms/[roomId]/expenses/voice', params: { roomId, ...(scheduleId ? { scheduleId } : {}) } })
            : setPicked(m)
        }
        scheduleTitle={scheduleTitle}
        owner={room?.owner_id === session?.user.id}
        memberCount={members?.filter((m) => !m.leftAt).length ?? 1}
        pass={passLoaded ? !!passRec : undefined}
        roomId={roomId}
      />
    );

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

  const goReview = async (draft: ExpenseDraft, localPhotos: string[], nav: 'replace' | 'push' = 'replace') => {
    await saveDraft(roomId, { draft, localPhotos }); // review가 기기에서 다시 읽는다
    router[nav]({ pathname: '/rooms/[roomId]/expenses/review', params: { roomId, ...(scheduleId ? { scheduleId } : {}) } });
  };

  // 영수증 사진인지 결제앱 캡처인지는 parse-expense가 판정해 photo_kind로 돌려준다(구 버전 응답이면 receipt).
  const photos = (p: typeof photo, kind: PhotoKind) => (p?.storagePath ? [{ storagePath: p.storagePath, kind }] : []);

  const manualTo = (nav: 'replace' | 'push') => {
    const source: ExpenseSource = method === 'photo' ? 'receipt' : method === 'text' ? 'card_text' : 'manual';
    const draft = emptyDraft({ ...ctx(source), currency: room.base_currency });
    void goReview({ ...draft, photos: photos(photo, 'receipt') }, photo ? [photo.local] : [], nav);
  };
  // onPress에 그대로 넘기므로 인자를 받지 않는다(이벤트 객체가 nav로 새지 않게).
  const manual = () => manualTo('replace');

  // 인식·업로드에 실패해도 사진은 작성 중 지출로 남긴다.
  const keepFailedPhoto = (p: NonNullable<typeof photo>) => {
    const draft = emptyDraft({ ...ctx('receipt'), currency: room.base_currency });
    return saveDraft(roomId, { draft: { ...draft, photos: photos(p, 'receipt') }, localPhotos: [p.local] });
  };

  const parse = async (
    req: { kind: 'image'; storagePath: string } | { kind: 'text' | 'ocr'; text: string },
    source: ExpenseSource,
    p: typeof photo,
  ) => {
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
    // 사진에서 온 입력(이미지·OCR 글자)이면 AI가 고른 종류로 source를 정한다. 붙여넣은 텍스트면 부른 쪽이 준 source를 쓴다.
    const kind: PhotoKind = result.photo_kind ?? 'receipt';
    const src: ExpenseSource = req.kind === 'text' ? source : (kind === 'capture' ? 'card_image' : 'receipt');
    // 공금 카드 끝자리와 일치하면 결제자를 '공금'으로(J7 2번).
    const draft = autoSelectPayer(draftFromParse(result, ctx(src)), { enabled: room.pool_enabled, cardLast4: room.pool_card_last4 });
    await goReview({ ...draft, photos: photos(p, kind) }, p ? [p.local] : []);
  };

  const uploadAndParse = async (p: { local: string; storagePath: string | null }) => {
    let next = p;
    setPhase({ kind: 'parsing' });
    if (!next.storagePath) {
      try {
        next = { ...p, storagePath: await uploadReceipt(roomId, expenseId, p.local) };
      } catch (err) {
        setPhase({ kind: 'failed', error: err as UserError, canRetry: true });
        await keepFailedPhoto(p);
        return;
      }
      setPhoto(next);
    }
    // 기기 OCR로 읽은 글자만 보낸다(영수증 사진은 Anthropic으로 가지 않는다).
    // 글자가 안 나오면 지금까지처럼 이미지를 보낸다 — 사용자에게는 차이가 보이지 않는다.
    // OCR이 읽는 건 preparePhoto가 만든 긴 변 1600px 사본이다. 숫자 인식이 모자라면 storage.ts의 LONG_EDGE가 지렛대다.
    const text = await recognizeReceipt(next.local, room.base_currency);
    await (text
      ? parse({ kind: 'ocr', text }, 'receipt', next)
      : parse({ kind: 'image', storagePath: next.storagePath! }, 'receipt', next));
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
    await acceptPhoto(res.assets[0].uri);
  };

  // EXIF를 지운 사본을 기기에 보관한다(앱이 종료돼도 이어 쓰기). 촬영·앨범이 같이 쓴다.
  const acceptPhoto = async (localUri: string) => {
    const { uri } = await preparePhoto(localUri);
    const p = { local: await keepPhoto(roomId, uri), storagePath: null };
    setPhoto(p);
    await uploadAndParse(p);
  };

  const shoot = async () => {
    const shot = await camRef.current?.takePictureAsync({ quality: 1 }).catch(() => null);
    if (!shot?.uri) return;
    await acceptPhoto(shot.uri);
  };

  const parseText = () => void parse({ kind: 'text', text: text.trim() }, 'card_text', null);

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
    // 방법 선택에서 왔으면 review를 push하고 picked를 되돌린다 — 뒤로가기가 방법 선택으로 돌아오게.
    return (
      <ManualRedirect
        onReady={() => {
          manualTo(picked ? 'push' : 'replace');
          setPicked(undefined);
        }}
      />
    );
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
            <Title title="사진으로 올리기" sub="영수증이든 결제앱 화면이든 알아서 구분해요" />
          </View>
          {/* 빈 공간을 프리뷰로 채운다. 종류 선택은 없앴다 — parse-expense가 photo_kind로 판정한다. */}
          {/* 네이티브 프리뷰가 부모의 모서리 마스크를 따르지 않아 아래만 각져 보인다.
              기기 비율에 따라 달라지는 문제라 네 모서리를 모두 각지게 맞춘다. */}
          <View className="mx-5 mb-3 mt-4 flex-1 overflow-hidden bg-ink">
            <CameraPane camRef={camRef} />
          </View>
          <BottomBar>
            <PrimaryButton title="촬영하기" icon={Camera} onPress={() => void shoot()} />
            <PrimaryButton title="앨범에서 고르기" icon={MediaImage} variant="muted" onPress={() => void pickPhoto('library')} />
          </BottomBar>
        </View>
      )}

      {phase.kind === 'input' && method === 'text' && (
        <View className="flex-1">
          {/* 입력칸 밖을 누르면 키보드를 내린다 */}
          <Pressable accessible={false} onPress={() => Keyboard.dismiss()} className="flex-1 gap-6 px-5 pt-2">
            <Title title="카드 문자 붙여넣기" sub="카드 승인 문자를 그대로 붙여넣어 주세요" />
            <View className="gap-2">
              <Text className="font-semibold text-sm text-ink-500">승인 문자</Text>
              <TextInput
                multiline
                value={text}
                onChangeText={setText}
                maxLength={TEXT_LIMIT}
                placeholder="카드 승인 문자를 붙여넣어 주세요"
                placeholderTextColor={colors.ink[300]}
                accessibilityLabel="카드 승인 문자"
                textAlignVertical="top"
                className="min-h-40 rounded-input border border-line bg-white p-4 text-input-17 text-ink focus:border-primary"
              />
              <Text className="self-end text-sm text-ink-400">
                {text.length.toLocaleString()}/{TEXT_LIMIT.toLocaleString()}
              </Text>
            </View>
          </Pressable>
          <BottomBar>
            <PrimaryButton title="인식하기" onPress={parseText} disabled={!text.trim()} />
          </BottomBar>
        </View>
      )}
    </SafeAreaView>
  );
}

// 화면 안 카메라 프리뷰. 권한이 없으면 허용 버튼만 보여주고, 앨범 경로는 그대로 쓸 수 있게 둔다.
function CameraPane({ camRef }: { camRef: React.RefObject<CameraView | null> }) {
  const [perm, requestPerm] = useCameraPermissions();
  if (!perm) return null; // 권한 상태 확인 중
  if (!perm.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-app px-8">
        <Text className="text-center text-base text-ink-500">바로 찍으려면 카메라 권한이 필요해요</Text>
        <PrimaryButton
          title={perm.canAskAgain ? '카메라 권한 허용' : '설정 열기'}
          variant="muted"
          onPress={() => void (perm.canAskAgain ? requestPerm() : Linking.openSettings())}
        />
      </View>
    );
  }
  return <CameraView ref={camRef} style={{ flex: 1 }} facing="back" />;
}

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <View className="gap-1.5">
      <Text className="font-semibold text-26 text-ink">
        {title}
      </Text>
      <Text className="text-17 text-ink-500">{sub}</Text>
    </View>
  );
}

// 11-18 시안: 세 칸 배경은 회색(app)으로 통일하고 아이콘 색만 다르다(문자 민트 / 음성 앰버 / 직접 스카이). 라벨은 두 줄.
const SUB_METHODS: { method: InputMethod; label: string; a11y: string; icon: typeof Camera; iconColor: string }[] = [
  { method: 'text', label: '카드 문자\n붙여넣기', a11y: '카드 문자 붙여넣기로 지출 추가', icon: MessageText, iconColor: colors.success.DEFAULT },
  { method: 'voice', label: '음성으로\n입력', a11y: '음성으로 지출 추가', icon: Microphone, iconColor: colors.warning.DEFAULT },
  { method: 'manual', label: '직접\n입력', a11y: '직접 입력으로 지출 추가', icon: EditPencil, iconColor: colors.primary.text },
];

// pass: 여행 패스 이용 중인지. 불러오는 중이면 undefined.
type PickerProps = {
  onSelect: (m: InputMethod) => void;
  scheduleTitle?: string;
  owner: boolean;
  memberCount: number;
  pass?: boolean;
  roomId: string;
};

// 지출 올리기 방법 선택. 11-18 시안에서 'AI 인식 N건 남음' 칩은 삭제됐다(한도를 다 쓰면 고를 때 패스 시트가 뜨는 것은 그대로).
function MethodPicker({ onSelect, scheduleTitle, owner, memberCount, pass: passOn, roomId }: PickerProps) {
  const toast = useToast();
  // 무료 AI 인식 한도(방당 5건). ponytail: 건수 데이터가 아직 없어 시안 값(DEMO_AI_USED)을 쓴다.
  const used = DEMO_AI_USED;
  const out = !passOn && used >= FREE_AI_LIMIT;
  const [pass, setPass] = useState<{ reason: PassReason | null } | null>(null);
  const insets = useSafeAreaInsets();
  // 기기에 남은 작성 중 지출(시안: 세 칸 아래 '이어서 쓰기' 카드). undefined = 아직 읽는 중.
  // 다 읽은 뒤에 시트를 띄운다 — 먼저 띄우면 시트 높이가 카드 없이 잡혀 카드가 잘린다.
  const [saved, setSaved] = useState<StoredDraft | null | undefined>(undefined);
  useEffect(() => {
    void loadDraft(roomId).then(setSaved);
  }, [roomId]);
  const select = (m: InputMethod) => (out && m !== 'manual' ? setPass({ reason: 'ai' }) : onSelect(m));
  if (saved === undefined) return null;
  // 여행 상세 위에 뜨는 바텀시트(11-18 시안 §3). 라우트가 transparentModal이라 뒤의 상세가 스크림 너머로 보인다.
  return (
    <View className="flex-1 justify-end">
      <Pressable accessibilityLabel="닫기" onPress={() => router.back()} className="absolute inset-0 bg-[rgba(23,32,58,0.45)]" />
      <Animated.View
        entering={SlideInDown.duration(320)}
        style={{ paddingBottom: Math.max(insets.bottom + 16, 36) }}
        className="max-h-[88%] rounded-t-sheet bg-white pt-2.5"
      >
        <View className="mb-4 h-[5px] w-10 self-center rounded-full bg-line" />
        <ScrollView contentContainerClassName="gap-4 px-5">
          {!!scheduleTitle && <ScheduleChip title={scheduleTitle} />}
          <View className="gap-1">
            {/* 22·15는 시안 값(스케일 밖) */}
            <Text className="font-semibold text-22 text-ink">어떻게 올릴까요?</Text>
            <Text className="text-15 text-ink-500">AI가 품목별로 나누고 결제일 환율로 바꿔드려요</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="영수증 사진으로 지출 추가"
            onPress={() => select('photo')}
            className="flex-row items-center gap-4 rounded-card bg-primary-text p-5 active:translate-y-px"
          >
            <View className="h-[52px] w-[52px] items-center justify-center rounded-button bg-white">
              <Icon as={Camera} size={26} color={colors.primary.text} />
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-lg text-primary-on">영수증 찍기</Text>
              <Text className="mt-[3px] text-sm text-primary-on">사진 한 장이면 품목·번역까지</Text>
            </View>
            <Icon as={NavArrowRight} size={22} color={colors.primary.on} />
          </Pressable>

          <View className="flex-row gap-2.5">
            {SUB_METHODS.map((m) => (
              <Pressable
                key={m.method}
                accessibilityRole="button"
                accessibilityLabel={m.a11y}
                onPress={() => select(m.method)}
                className="flex-1 items-center gap-2.5 rounded-card bg-app px-3 py-4 active:bg-muted"
              >
                <Icon as={m.icon} size={24} color={m.iconColor} />
                <Text style={{ lineHeight: 21 }} className="text-center font-semibold text-15 text-ink">
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {saved && <DraftCard stored={saved} onPress={() => router.replace({ pathname: '/rooms/[roomId]/expenses/review', params: { roomId } })} />}
        </ScrollView>
      </Animated.View>
      <PassSheet
        visible={!!pass}
        reason={pass?.reason}
        owner={owner}
        memberCount={memberCount}
        onClose={() => setPass(null)}
        onPay={() => {
          setPass(null);
          toast('결제는 곧 열려요');
        }}
        onRequest={() => {
          setPass(null);
          toast('방장에게 결제 요청을 보냈어요');
        }}
      />
    </View>
  );
}

// 시안: 둥글기 20 · 테두리 sky-100 · 아이콘 칸 36(회색) · 캡션 12 / 제목 15·600 · 오른쪽 '이어서 쓰기 >'.
function DraftCard({ stored, onPress }: { stored: StoredDraft; onPress: () => void }) {
  const { merchant, items, currency } = stored.draft;
  const total = items.reduce((a, it) => a + it.amountOriginal, 0);
  const title = [merchant.trim() || '이름 없는 지출', total > 0 ? formatForeign(total, currency) : ''].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`작성 중인 지출 ${title} 이어서 쓰기`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-card border border-sky-100 bg-white px-3.5 py-3 active:bg-app"
      style={{ boxShadow: '0 0 4px rgba(18,114,191,.09)' }} // TODO(token): 시안 그림자
    >
      <View className="h-9 w-9 items-center justify-center rounded-chip bg-app">
        <Icon as={EditPencil} size={18} color={colors.ink[500]} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-xs text-ink-500">작성 중인 지출 1건</Text>
        <Text numberOfLines={1} className="font-semibold text-15 text-ink">
          {title}
        </Text>
      </View>
      <View className="flex-row items-center gap-0.5">
        <Text className="font-semibold text-13 text-ink">이어서 쓰기</Text>
        <Icon as={NavArrowRight} size={15} color={colors.ink.DEFAULT} />
      </View>
    </Pressable>
  );
}

function ManualRedirect({ onReady }: { onReady: () => void }) {
  const once = useRef(onReady);
  useEffect(() => once.current(), []);
  return null;
}
