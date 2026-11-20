// 말로 입력(핸드오프 splito-voice-handoff, 가게별 묶음 + 드래그). 여러 번 말하면 품목이 쌓이고,
// AI가 가게를 붙여 같은 가게끼리 한 카드로 묶는다. 어느 가게인지 모르는 품목은 맨 아래에 따로 두고 끌어서 넣게 한다.
// 저장하면 가게 1곳 = 지출 1건: 결제자 = 나, 품목마다 그 사람 몫, source = voice.
import { useQueryClient } from '@tanstack/react-query';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { EditPencil, HelpCircle, Microphone, Pause, Plus, Shop, Trash, Xmark } from 'iconoir-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Keyboard, Linking, Pressable, ScrollView, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { CURRENCIES } from '@/lib/currency';
import { toUserError, type UserError } from '@/lib/errors';
import {
  canFinishEdit, formatVoiceAmount, groupByStore, itemsFromParse, mixedCurrencyStore, newStoreName, storePayload,
  toggleMember, voiceTotal, type VoiceItem,
} from '@/lib/voice';
import { uuidV4 } from '@/lib/uuid';
import { api } from '@/services/api';
import { colors, memberColor } from '@/theme/tokens';

const VOICE_LIMIT_MS = 60_000;
const LONG_PRESS_MS = 350;
const NEW_ZONE = '__new';
const AUTO_SCROLL_EDGE = 60;

type Mic = 'idle' | 'rec' | 'parsing';
type Drag = { key: string; top: number; left: number; width: number }; // 손가락을 따라가는 행의 자리(목록 영역 기준)
type Frame = { x: number; y: number; w: number }; // 끌기 시작한 행의 화면 위치

// api는 이미 UserError로 던진다. 아니면 변환한다.
const asUserError = (err: unknown): UserError =>
  typeof err === 'object' && err !== null && 'code' in err ? (err as UserError) : toUserError(err);

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function VoiceInput() {
  const { roomId, scheduleId } = useLocalSearchParams<{ roomId: string; scheduleId?: string }>();
  const { session, profile, refreshProfile } = useAuth();
  const { data: room } = useRoom(roomId);
  const { data: members } = useRoomMembers(roomId);
  const toast = useToast();
  const qc = useQueryClient();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<VoiceItem[]>([]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [storeEdit, setStoreEdit] = useState<string | null>(null); // 이름을 고치는 중인 가게
  const [mic, setMic] = useState<Mic>('idle');
  const [live, setLive] = useState('');
  const [misheard, setMisheard] = useState(false);
  const [permSheet, setPermSheet] = useState(false);
  const [noticeDone, setNoticeDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null); // 끌고 있는 품목을 올려 둔 가게 / NEW_ZONE
  const finalText = useRef('');
  const liveText = useRef('');

  // 드래그 대상 판정: 카드 위치(스크롤 내용 기준)·스크롤 위치·목록 영역의 화면 위치와 보이는 높이.
  const scrollRef = useRef<ScrollView>(null);
  const listRef = useRef<View>(null);
  const zones = useRef(new Map<string, { y: number; h: number }>());
  const overRef = useRef<string | null>(null); // 손을 뗄 때 판정은 state가 아니라 이 값으로(마지막 이동이 아직 안 그려졌을 수 있다)
  const scrollY = useRef(0);
  const listTop = useRef(0);
  const grab = useRef(0); // 손가락과 행 윗변의 거리(행이 손가락 아래에서 튀지 않게)
  const visibleH = useRef(0);
  const sheetH = useRef(0);

  const me = members?.find((m) => m.userId === session?.user.id && !m.leftAt);
  // 사람 칩: 동행만(QR로만 들어온 사람·나간 사람 제외). 색은 참여자 목록 순서(members 화면과 같다).
  const people = (members ?? []).filter((m) => !m.leftAt && !m.spotOnly);
  const colorIndex = new Map((members ?? []).map((m, i) => [m.id, i]));
  const nameOf = (id: string) => (id === me?.id ? '나' : (members?.find((m) => m.id === id)?.name ?? '나'));
  const whoOf = (c: VoiceItem) => c.memberIds.map((id) => ({ name: nameOf(id), color: memberColor(colorIndex.get(id) ?? 0) }));

  async function recognize(text: string) {
    if (!room || !me) return;
    if (!text) {
      setMic('idle');
      setMisheard(true);
      return;
    }
    setMic('parsing');
    try {
      const had = new Set(items.map((i) => i.store));
      const parsed = await api.parseVoice({
        roomId, text, names: people.map((p) => p.name), stores: [...had].filter((x): x is string => x !== null), baseCurrency: room.base_currency,
      });
      if (!parsed.length) {
        setMisheard(true);
        return;
      }
      const added = itemsFromParse(parsed, people, me.id, uuidV4);
      setItems((cs) => [...cs, ...added]);
      // 금액을 못 들은 품목은 바로 편집을 연다.
      const noAmount = added.find((c) => !c.amount);
      if (noAmount) setEditKey(noAmount.key);
      const stores = [...new Set(added.map((a) => a.store))];
      const merged = stores.find((s) => s !== null && had.has(s));
      if (added.some((a) => a.store === null)) toast('어느 가게인지 모르는 품목은 아래에 따로 뒀어요');
      else if (merged) toast(`${merged} 지출에 합쳤어요`);
      else if (stores.length > 1) toast(`가게별로 ${stores.length}건으로 정리했어요`);
    } catch (err) {
      const e = asUserError(err);
      toast(e.code === 'AI_QUOTA_EXCEEDED' ? e.message : '인식하지 못했어요. 다시 시도해 주세요');
    } finally {
      setMic('idle');
    }
  }

  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) finalText.current = `${finalText.current} ${t}`.trim();
    liveText.current = e.isFinal ? finalText.current : `${finalText.current} ${t}`.trim();
    setLive(liveText.current);
  });
  useSpeechRecognitionEvent('end', () => void recognize(liveText.current.trim()));
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'aborted' || e.error === 'no-speech') return; // 'end'가 뒤따라 온다
    setMic('idle');
    if (e.error === 'not-allowed') setPermSheet(true);
    else toast('인식하지 못했어요. 다시 시도해 주세요');
  });

  // 최대 60초 후 자동으로 멈춘다. 화면을 떠나면 인식을 끊는다.
  useEffect(() => {
    if (mic !== 'rec') return;
    const t = setTimeout(() => ExpoSpeechRecognitionModule.stop(), VOICE_LIMIT_MS);
    return () => clearTimeout(t);
  }, [mic]);
  useEffect(() => () => ExpoSpeechRecognitionModule.abort(), []);

  // 저장하지 않은 품목이 있으면 뒤로가기 전에 확인한다(제스처·하드웨어 뒤로 포함).
  const unsaved = items.length > 0 && !saving;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!unsaved) return;
        e.preventDefault();
        Alert.alert(`저장하지 않은 품목 ${items.length}개가 사라져요`, undefined, [
          { text: '계속 입력', style: 'cancel' },
          { text: '나가기', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, unsaved, items.length],
  );

  if (!room || !members || !me || profile === undefined) return null;

  const startRec = async () => {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      toast('이 기기에서는 음성 인식을 쓸 수 없어요');
      return;
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setPermSheet(true);
      return;
    }
    finalText.current = '';
    liveText.current = '';
    setLive('');
    setMisheard(false);
    setEditKey(null);
    setStoreEdit(null);
    setMic('rec');
    // 기기 STT만 쓴다. 음성 파일은 서버로 보내지 않는다(ADR-004).
    ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
  };

  const onMic = () => (mic === 'rec' ? ExpoSpeechRecognitionModule.stop() : mic === 'idle' ? void startRec() : undefined);

  const update = (key: string, patch: Partial<VoiceItem>) => setItems((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const remove = (key: string) => {
    setItems((cs) => cs.filter((c) => c.key !== key));
    setEditKey(null);
    toast('삭제했어요');
  };
  const removeStore = (store: string | null) => {
    setItems((cs) => cs.filter((c) => c.store !== store));
    setEditKey(null);
    toast('삭제했어요');
  };
  // 펼친 품목·가게 이름 편집을 닫는다(다른 곳을 누르면). 키보드를 내리면 가게 이름 입력의 blur가 이름을 반영한다.
  const closeEdit = () => {
    setEditKey(null);
    Keyboard.dismiss();
  };
  // 가게 이름 바꾸기. 이미 있는 가게 이름이면 그 카드로 합쳐진다. 비우면 원래 이름을 둔다.
  const renameStore = (from: string, to: string) => {
    setStoreEdit(null);
    const name = to.trim();
    if (!name || name === from) return;
    if (items.some((i) => i.store === name)) toast(`${name} 지출에 합쳤어요`);
    setItems((cs) => cs.map((c) => (c.store === from ? { ...c, store: name } : c)));
  };

  // ---- 드래그(길게 눌러 시작) ----
  const canDrag = mic === 'idle' && storeEdit === null && !saving;
  const toListY = (pageY: number) => pageY - listTop.current;
  const zoneAt = (listY: number) => {
    const y = listY + scrollY.current;
    for (const [key, r] of zones.current) if (y >= r.y && y <= r.y + r.h) return key;
    return null;
  };
  const dragStart = (c: VoiceItem, pageY: number, row: Frame) => {
    const live = new Set<string>(items.map((i) => i.store ?? '__unsorted'));
    for (const k of zones.current.keys()) if (!live.has(k)) zones.current.delete(k); // 지운 가게·지난 드래그의 새 가게 칸
    setEditKey(null);
    listRef.current?.measureInWindow((x, top, _w, h) => {
      listTop.current = top;
      visibleH.current = h - sheetH.current;
      grab.current = pageY - row.y;
      setDrag({ key: c.key, top: row.y - top, left: row.x - x, width: row.w });
    });
  };
  const dragMove = (pageY: number) => {
    const y = toListY(pageY);
    // ponytail: 손가락이 움직일 때만 가장자리 자동 스크롤한다. 가만히 대고 있어도 흐르게 하려면 타이머로 바꾼다.
    if (y > visibleH.current - AUTO_SCROLL_EDGE) scrollRef.current?.scrollTo({ y: scrollY.current + 12, animated: false });
    else if (y < AUTO_SCROLL_EDGE && scrollY.current > 0) scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current - 12), animated: false });
    setDrag((d) => (d ? { ...d, top: y - grab.current } : d));
    const z = zoneAt(y);
    overRef.current = z === '__unsorted' ? null : z;
    setOver(overRef.current);
  };
  const dragEnd = () => {
    const d = drag;
    const target = overRef.current;
    overRef.current = null;
    setDrag(null);
    setOver(null);
    if (!d || !target) return;
    const cur = items.find((i) => i.key === d.key);
    if (!cur || cur.store === target) return;
    if (target === NEW_ZONE) {
      update(d.key, { store: newStoreName(items) });
      toast('새 가게로 분리했어요');
    } else {
      update(d.key, { store: target });
      toast(`‘${cur.title}’을 ${target}(으)로 옮겼어요`);
    }
  };
  const dragCancel = () => {
    overRef.current = null;
    setDrag(null);
    setOver(null);
  };

  const { stores, unsorted } = groupByStore(items);
  const dragged = drag ? items.find((i) => i.key === drag.key) : undefined;
  const incomplete = items.some((i) => !canFinishEdit(i));
  const canSave = stores.length > 0 && !unsorted.length && !incomplete && mic === 'idle' && storeEdit === null && !saving;
  // 가게마다 한 건씩 저장하고, 저장된 가게는 목록에서 뺀다. 중간에 실패하면 남은 가게만 다시 저장하면 된다.
  const save = async () => {
    const mixed = mixedCurrencyStore(items);
    if (mixed) {
      toast(`${mixed}에 통화가 섞여 있어요. 한 통화로 맞춰 주세요`);
      return;
    }
    setEditKey(null);
    setSaving(true);
    const n = stores.length;
    for (const g of stores) {
      try {
        const payload = storePayload(g.store, g.items, { roomId, meMemberId: me.id, todayLocal: localToday(), expenseId: uuidV4(), newId: uuidV4 });
        const saved = await api.saveExpense(payload, null);
        if (scheduleId) await api.setExpenseMeta({ expenseId: saved.id, scheduleId });
        setItems((cs) => cs.filter((x) => x.store !== g.store));
      } catch (err) {
        setSaving(false);
        toast(asUserError(err).message);
        await qc.invalidateQueries({ queryKey: ['room', roomId, 'feed'] });
        return;
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['room', roomId, 'feed'] }),
      qc.invalidateQueries({ queryKey: ['rooms'] }),
    ]);
    toast(`지출 ${n}건을 저장했어요`);
    router.dismissTo({ pathname: '/rooms/[roomId]', params: { roomId } });
  };

  const needNotice = !profile?.ai_notice_ack_at && !noticeDone;
  const ackNotice = async () => {
    setNoticeDone(true);
    await api.ackAiNotice().catch(() => undefined); // 실패해도 다음에 다시 묻는 것뿐이다
    await refreshProfile().catch(() => undefined);
  };
  const toManual = () =>
    router.replace({ pathname: '/rooms/[roomId]/expenses/new', params: { roomId, method: 'manual', ...(scheduleId ? { scheduleId } : {}) } });

  const rec = mic === 'rec';
  const stateText = rec
    ? '듣고 있어요'
    : mic === 'parsing'
      ? 'AI가 가게별로 나누고 있어요'
      : misheard
        ? '잘 못 들었어요. 다시 말해 주세요'
        : incomplete && editKey === null
          ? '품목 이름이나 금액이 비어 있어요'
          : unsorted.length
            ? '어느 가게인지 모르는 품목을 끌어서 넣어 주세요'
            : items.length
              ? '더 있으면 이어서 말해 주세요'
              : '마이크를 누르고 말해 주세요';
  const liveLine = rec ? (live ? `“${live}”` : '') : items.length || misheard || mic === 'parsing' ? '' : '예: 지훈이 편의점 5천 원';

  const renderItem = (c: VoiceItem) =>
    editKey === c.key ? (
      <EditRow
        key={c.key}
        item={c}
        people={people.map((p) => ({ id: p.id, name: p.id === me.id ? '나' : p.name, color: memberColor(colorIndex.get(p.id) ?? 0) }))}
        onChange={(patch) => update(c.key, patch)}
        onRemove={() => remove(c.key)}
      />
    ) : (
      <ItemRow
        key={c.key}
        item={c}
        who={whoOf(c)}
        dragging={drag?.key === c.key}
        canDrag={canDrag}
        onEdit={() => (canDrag ? setEditKey(c.key) : undefined)} // 다른 품목이 펼쳐져 있으면 그건 닫힌다
        onDragStart={(pageY, row) => dragStart(c, pageY, row)}
        onDragMove={dragMove}
        onDragEnd={dragEnd}
        onDragCancel={dragCancel}
      />
    );

  return (
    <SafeAreaView className="flex-1 bg-app" edges={['top']}>
      <BottomSheet visible={needNotice} onClose={() => router.back()} title="말한 내용이 인식을 위해 Anthropic(미국)으로 전송돼요" subtitle="음성 파일은 보내지 않고 글자만 보내요. 원하지 않으면 직접 입력할 수 있어요.">
        <View className="gap-2.5">
          <PrimaryButton title="확인" onPress={() => void ackNotice()} />
          <PrimaryButton title="직접 입력할게요" variant="muted" onPress={toManual} />
        </View>
      </BottomSheet>
      <BottomSheet visible={permSheet} onClose={() => setPermSheet(false)} title="마이크 권한이 필요해요" subtitle="설정에서 마이크와 음성 인식을 허용해 주세요.">
        <View className="gap-2.5">
          <PrimaryButton title="설정 열기" onPress={() => { setPermSheet(false); void Linking.openSettings(); }} />
          <PrimaryButton title="직접 입력하기" variant="muted" onPress={toManual} />
        </View>
      </BottomSheet>

      <NavBar title="말로 입력" align="center" />

      <View ref={listRef} className="flex-1">
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!drag}
          onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          contentContainerClassName="px-5 pt-1"
          contentContainerStyle={{ paddingBottom: 300 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable accessible={false} onPress={closeEdit} className="gap-3.5">
          <View className="gap-1">
            <Text style={{ lineHeight: 32 }} className="font-semibold text-22 text-ink">
              {'누가 얼마 썼는지\n말해 주세요'}
            </Text>
            <Text className="text-sm text-ink-500">같은 가게에서 쓴 건 AI가 한 건으로 묶어 드려요</Text>
          </View>

          {items.length > 0 && (
            <View className="flex-row items-baseline justify-between gap-3 px-1 py-0.5">
              <Text numberOfLines={1} className="text-sm text-ink-500">
                지출 {stores.length}건 · 품목 {items.length}개
              </Text>
              <Text numberOfLines={1} className="font-semibold text-lg text-ink">
                {voiceTotal(items)}
              </Text>
            </View>
          )}

          {!items.length && !rec && (
            <View className="items-center gap-1.5 rounded-card border border-dashed border-line-off px-4 py-7">
              <Icon as={Microphone} size={24} color={colors.ink[300]} />
              <Text className="text-sm text-ink-400">아직 입력한 지출이 없어요</Text>
            </View>
          )}

          {stores.map((g) => (
            <StoreCard
              key={g.store}
              store={g.store}
              items={g.items}
              over={over === g.store}
              editingName={storeEdit === g.store}
              onEditName={() => (canDrag ? setStoreEdit(g.store) : undefined)}
              onRename={(to) => renameStore(g.store, to)}
              onRemove={() => removeStore(g.store)}
              onLayout={(y, h) => zones.current.set(g.store, { y, h })}
            >
              {g.items.map(renderItem)}
            </StoreCard>
          ))}

          {unsorted.length > 0 && (
            <View
              onLayout={(e) => zones.current.set('__unsorted', { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
              className="rounded-button border border-dashed border-warning-line bg-warning-banner"
            >
              <View className="flex-row items-center gap-3 px-4 pb-3 pt-3.5">
                <View className="h-10 w-10 items-center justify-center rounded-chip bg-white">
                  <Icon as={HelpCircle} size={20} color={colors.warning.DEFAULT} />
                </View>
                <View className="min-w-0 flex-1 gap-px">
                  <Text className="font-semibold text-base text-ink">어느 가게인지 모르겠어요</Text>
                  <Text className="text-xs text-ink-400">길게 눌러 가게 카드로 끌어다 놓아 주세요</Text>
                </View>
              </View>
              <View className="gap-1.5 px-2.5 pb-2.5">{unsorted.map(renderItem)}</View>
              <RemoveBadge label="가게 모르는 품목 전체 삭제" onPress={() => removeStore(null)} />
            </View>
          )}

          {drag && (
            <View
              onLayout={(e) => zones.current.set(NEW_ZONE, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
              style={{ borderColor: over === NEW_ZONE ? colors.primary.DEFAULT : colors.sky[200] }}
              className={`h-16 flex-row items-center justify-center gap-[5px] rounded-button border border-dashed ${over === NEW_ZONE ? 'bg-sky-100' : ''}`}
            >
              <Icon as={Plus} size={14} color={colors.ink.DEFAULT} />
              <Text className="font-medium text-13 text-ink">여기에 놓으면 새 가게로 분리돼요</Text>
            </View>
          )}
          </Pressable>
        </ScrollView>

        {drag && dragged && (
          <View
            pointerEvents="none"
            style={{ top: drag.top, left: drag.left, width: drag.width, boxShadow: '0 12px 28px -10px rgba(19,25,39,.35)' }}
            className="absolute rounded-badge"
          >
            <RowLook item={dragged} who={whoOf(dragged)} />
          </View>
        )}
      </View>

      <View
        onLayout={(e) => (sheetH.current = e.nativeEvent.layout.height)}
        onStartShouldSetResponder={() => true}
        onResponderRelease={closeEdit}
        className="absolute bottom-0 left-0 right-0 items-center gap-3.5 rounded-t-sheet bg-white px-5 pt-[18px]"
        style={{ paddingBottom: Math.max(insets.bottom + 12, 24), boxShadow: '0 -8px 24px -12px rgba(19,25,39,.18)' }}
      >
        <View className="min-h-12 items-center justify-center gap-0.5">
          <Text className={`text-center font-semibold text-13 ${rec ? 'text-danger' : 'text-ink-400'}`}>{stateText}</Text>
          {!!liveLine && <Text className="text-center font-semibold text-base text-ink">{liveLine}</Text>}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rec ? '말하기 멈추기' : '말하기 시작'}
          disabled={mic === 'parsing'}
          onPress={onMic}
          className={`h-[76px] w-[76px] items-center justify-center rounded-full border ${rec ? 'border-danger bg-danger' : 'border-line bg-white'}`}
          style={{ boxShadow: rec ? '0 0 0 10px rgba(217,33,72,.12)' : '0 10px 24px -8px rgba(19,25,39,.25)' }}
        >
          {mic === 'parsing' ? (
            <ActivityIndicator color={colors.ink.DEFAULT} />
          ) : (
            <Icon as={rec ? Pause : Microphone} size={32} color={rec ? '#FFFFFF' : colors.ink.DEFAULT} />
          )}
        </Pressable>
        <View className="self-stretch">
          <PrimaryButton
            title={stores.length ? `지출 ${stores.length}건 저장하기` : '확인하고 저장'}
            variant="dark"
            disabled={!canSave}
            loading={saving}
            onPress={() => void save()}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

type Color = { tint: string; fg: string };

function RemoveBadge({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full border border-line bg-white"
      style={{ boxShadow: '0 2px 6px -2px rgba(23,32,58,.18)' }}
    >
      <Icon as={Xmark} size={14} color={colors.ink[400]} />
    </Pressable>
  );
}

type StoreProps = {
  store: string;
  items: VoiceItem[];
  over: boolean;
  editingName: boolean;
  onEditName: () => void;
  onRename: (to: string) => void;
  onRemove: () => void;
  onLayout: (y: number, h: number) => void;
  children: ReactNode;
};

// 가게 카드: 바탕 sky-50(끌어 올리면 sky-100 + primary 테두리).
function StoreCard({ store, items, over, editingName, onEditName, onRename, onRemove, onLayout, children }: StoreProps) {
  return (
    <View
      onLayout={(e) => onLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={{ backgroundColor: over ? colors.sky[100] : colors.sky[50], borderColor: over ? colors.primary.DEFAULT : 'transparent' }}
      className="rounded-button border"
    >
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-3.5">
        <View className="h-10 w-10 items-center justify-center rounded-chip bg-white">
          <Icon as={Shop} size={20} color={colors.primary.DEFAULT} />
        </View>
        <View className="min-w-0 flex-1 gap-px">
          <StoreName store={store} editing={editingName} onEdit={onEditName} onDone={onRename} />
          <Text className="text-xs text-ink-400">품목 {items.length}개</Text>
        </View>
        <Text numberOfLines={1} className="font-semibold text-lg text-ink">
          {voiceTotal(items)}
        </Text>
      </View>
      <View className="gap-1.5 px-2.5 pb-2.5">{children}</View>
      <RemoveBadge label={`${store} 전체 삭제`} onPress={onRemove} />
    </View>
  );
}

// 가게 이름. 이름 아래 연한 실선 + 끝에 작은 연필 = 고칠 수 있다는 표시, 고치는 중에는 둘만 진해진다.
// 보기·편집 모두 같은 TextInput을 써서(편집만 켰다 껐다) 누를 때 글자가 움직이지 않는다. 실선은 글자 폭만큼.
function StoreName({ store, editing, onEdit, onDone }: { store: string; editing: boolean; onEdit: () => void; onDone: (to: string) => void }) {
  const ref = useRef<TextInput>(null);
  const [name, setName] = useState(store);
  const [prev, setPrev] = useState(store);
  if (prev !== store) {
    setPrev(store); // 합쳐지거나 바뀐 이름을 따라간다
    setName(store);
  }
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  const finish = () => {
    if (!editing) return;
    if (!name.trim()) setName(store); // 비우면 원래 이름으로
    onDone(name);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${store} 가게 이름 바꾸기`}
      onPress={onEdit}
      disabled={editing}
      style={{ borderBottomColor: editing ? colors.primary.DEFAULT : colors.sky[200] }}
      className="max-w-full flex-row items-center gap-1.5 self-start border-b pb-0.5"
    >
      <TextInput
        ref={ref}
        value={name}
        onChangeText={setName}
        onSubmitEditing={finish}
        onBlur={finish}
        editable={editing}
        pointerEvents={editing ? 'auto' : 'none'}
        selectTextOnFocus
        maxLength={80}
        returnKeyType="done"
        accessibilityLabel="가게 이름"
        style={{ padding: 0, margin: 0, fontSize: 16, minWidth: 24 }}
        className="shrink font-semibold text-ink"
      />
      <Icon as={EditPencil} size={13} color={editing ? colors.primary.DEFAULT : colors.ink[300]} />
    </Pressable>
  );
}

type RowProps = {
  item: VoiceItem;
  who: Who[];
  dragging: boolean;
  canDrag: boolean;
  onEdit: () => void;
  onDragStart: (pageY: number, row: Frame) => void;
  onDragMove: (pageY: number) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
};

// 핸들 ⠿: 점 2개짜리 줄 3개(2px 점, 간격 2.5, 바깥 4/3 여백). 시안 실측.
function Handle() {
  return (
    <View className="gap-[2.5px] px-[3px] py-1">
      {[0, 1, 2].map((r) => (
        <View key={r} className="flex-row gap-[2.5px]">
          <View className="h-[2px] w-[2px] rounded-full bg-line-off" />
          <View className="h-[2px] w-[2px] rounded-full bg-line-off" />
        </View>
      ))}
    </View>
  );
}

type Who = { name: string; color: Color };

// 품목 행의 모양. 목록의 행과 끌고 있는 행이 같은 모양을 쓴다. 사람이 여럿이면 아바타를 겹쳐 놓는다.
function RowLook({ item: c, who, handle }: { item: VoiceItem; who: Who[]; handle?: ReactNode }) {
  return (
    <View
      style={{ boxShadow: '0 1px 2px rgba(23,32,58,.06)' }}
      className="flex-row items-center gap-2 rounded-badge border border-transparent bg-white py-[7px] pl-1.5 pr-3"
    >
      {handle ?? <Handle />}
      <View className="flex-row">
        {who.map((w, i) => (
          <View
            key={i}
            style={{ backgroundColor: w.color.tint, marginLeft: i ? -8 : 0 }}
            className="h-[26px] w-[26px] items-center justify-center rounded-full border border-white"
          >
            <Text style={{ color: w.color.fg }} className="font-semibold text-xs">
              {w.name.slice(0, 1)}
            </Text>
          </View>
        ))}
      </View>
      <Text numberOfLines={1} className="min-w-0 flex-1 font-semibold text-sm text-ink-700">
        {c.title}
      </Text>
      <Text className="font-semibold text-sm text-ink-700">{formatVoiceAmount(c.amount, c.currency)}</Text>
    </View>
  );
}

// 품목 행. 핸들 ⠿은 누르자마자 드래그, 나머지는 짧게 누르면 편집·길게 누르면 드래그(끄는 동안 흐리게).
// 행에서 손가락이 먼저 움직이면 스크롤에 양보한다.
function ItemRow({ item: c, who, dragging, canDrag, onEdit, onDragStart, onDragMove, onDragEnd, onDragCancel }: RowProps) {
  const rowRef = useRef<View>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ y: 0, moved: false, active: false, handle: false });
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const begin = (pageY: number) => {
    start.current.active = true;
    rowRef.current?.measureInWindow((x, y, w) => onDragStart(pageY, { x, y, w }));
  };
  // 핸들은 바로 드래그(탭은 아무것도 안 함), 행은 길게 눌러 드래그(탭은 편집).
  const grant = (e: GestureResponderEvent, handle: boolean) => {
    const pageY = e.nativeEvent.pageY;
    start.current = { y: pageY, moved: false, active: false, handle };
    if (!canDrag) return;
    if (handle) begin(pageY);
    else timer.current = setTimeout(() => begin(pageY), LONG_PRESS_MS);
  };
  const onMove = (e: GestureResponderEvent) => {
    if (start.current.active) return onDragMove(e.nativeEvent.pageY);
    if (Math.abs(e.nativeEvent.pageY - start.current.y) > 8) {
      start.current.moved = true;
      clear();
    }
  };
  const onRelease = () => {
    clear();
    if (start.current.active) onDragEnd();
    else if (!start.current.moved && !start.current.handle) onEdit();
    start.current.active = false;
  };
  const onTerminate = () => {
    clear();
    if (start.current.active) onDragCancel();
    start.current.active = false;
  };
  const keep = () => !start.current.active;

  return (
    <View
      ref={rowRef}
      accessibilityRole="button"
      accessibilityLabel={`${c.title} 편집`}
      accessibilityHint="왼쪽 손잡이를 끌면 다른 가게로 옮겨요"
      onAccessibilityTap={onEdit}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => grant(e, false)}
      onResponderMove={onMove}
      onResponderRelease={onRelease}
      onResponderTerminate={onTerminate}
      onResponderTerminationRequest={keep}
      style={{ opacity: dragging ? 0.4 : 1 }}
    >
      <RowLook
        item={c}
        who={who}
        handle={
          <View
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 6 }}
            onStartShouldSetResponder={() => true}
            onResponderGrant={(e) => grant(e, true)}
            onResponderMove={onMove}
            onResponderRelease={onRelease}
            onResponderTerminate={onTerminate}
            onResponderTerminationRequest={keep}
          >
            <Handle />
          </View>
        }
      />
    </View>
  );
}

type EditProps = {
  item: VoiceItem;
  people: { id: string; name: string; color: Color }[];
  onChange: (patch: Partial<VoiceItem>) => void;
  onRemove: () => void;
};

// 품목 편집: 들은 말 · 사람(여러 명) · 품목 · 금액, 오른쪽 위 휴지통. 가게 이름은 카드 위 가게명을 눌러 바꾼다.
// 닫기는 다른 곳을 누르면 된다. 안을 누른 탭은 여기서 받아 바깥 닫기로 새지 않게 한다.
function EditRow({ item: c, people, onChange, onRemove }: EditProps) {
  const unit = c.currency === 'KRW' ? '원' : (CURRENCIES.find((x) => x.code === c.currency)?.symbol ?? c.currency);
  return (
    <View onStartShouldSetResponder={() => true} className="gap-3 rounded-badge border border-primary bg-white px-3.5 pb-3.5 pt-3">
      <View className="flex-row items-start gap-2">
        <Text className="min-w-0 flex-1 text-xs text-ink-400">들은 말 · “{c.part}”</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${c.title} 삭제`} hitSlop={10} onPress={onRemove}>
          <Icon as={Trash} size={16} color={colors.danger.DEFAULT} />
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        {people.map((p) => {
          const on = c.memberIds.includes(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => onChange({ memberIds: toggleMember(c.memberIds, p.id) })}
              style={{ backgroundColor: on ? p.color.tint : '#FFFFFF', borderColor: on ? p.color.tint : colors['card-line'] }}
              className="h-[34px] flex-row items-center gap-1.5 rounded-full border pl-[3px] pr-[11px]"
            >
              <View style={{ backgroundColor: on ? p.color.fg : colors.muted }} className="h-[26px] w-[26px] items-center justify-center rounded-full">
                <Text style={{ color: on ? '#FFFFFF' : colors.ink[300] }} className="font-semibold text-xs">
                  {p.name.slice(0, 1)}
                </Text>
              </View>
              <Text style={{ color: on ? p.color.fg : colors.ink[300] }} className="font-semibold text-13">
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row gap-2">
        <TextInput
          value={c.title}
          onChangeText={(t) => onChange({ title: t })}
          placeholder="품목"
          placeholderTextColor={colors.ink[300]}
          maxLength={80}
          accessibilityLabel="품목"
          className="h-12 min-w-0 flex-1 rounded-chip border border-line px-3 font-semibold text-15 text-ink focus:border-primary"
        />
        <View className="h-12 w-[130px] flex-row items-center gap-1 rounded-chip border border-line px-3">
          {/* ponytail: 정수만 받는다. 센트 단위 외화를 말로 넣는 경우가 생기면 parseAmountInput으로 바꾼다. */}
          <TextInput
            value={c.amount ? c.amount.toLocaleString('ko-KR') : ''}
            onChangeText={(t) => onChange({ amount: parseInt(t.replace(/[^0-9]/g, ''), 10) || 0 })}
            keyboardType="number-pad"
            accessibilityLabel="금액"
            className="min-w-0 flex-1 text-right font-semibold text-15 text-ink"
          />
          <Text className="font-semibold text-15 text-ink-500">{unit}</Text>
        </View>
      </View>
    </View>
  );
}
