// 음성으로 기록(시안 Image #19~#21). 말하면 AI가 가게별로 나누고, 가게 하나씩 영수증 티켓으로 보여 준다.
// 아래 마이크로 이어 말하면 새 가게·품목을 붙이거나, 기존 품목·가게 이름을 고친다(parse-expense의 current/renames).
// 저장하면 가게 1곳 = 지출 1건: 결제자 = 나(또는 공금), 품목마다 그 사람 몫, source = voice.
import { useQueryClient } from '@tanstack/react-query';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Calendar, Check, Microphone, NavArrowDown, NavArrowRight, Pause, Plus, Xmark } from 'iconoir-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { CategoryCircle } from '@/components/CategoryCircle';
import { DateSheet } from '@/components/DateSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { PoolPayToggle } from '@/components/PoolPayToggle';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { ItemRow } from '@/components/review/ItemRow';
import { Perforation, WavyBottom } from '@/components/review/TicketEdge';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useScheduleItems, useTripBooking } from '@/hooks/useBooking';
import { useFxPreview } from '@/hooks/useFxPreview';
import { usePoolBalance } from '@/hooks/usePool';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { addDays, shortDate, tripDayTag } from '@/lib/calendar';
import { categoryLabel, type CategoryCode } from '@/lib/category';
import { toUserError, type UserError } from '@/lib/errors';
import { defaultScheduleId, parseAmountInput, perPersonOriginal, scheduleMatchesCategory, splitLabel } from '@/lib/expenseForm';
import { floorDiv, formatKrw } from '@/lib/money';
import { poolShortage, sumKrw } from '@/lib/pool';
import { dayIndexOfDate } from '@/lib/schedule';
import { uuidV4 } from '@/lib/uuid';
import {
  applyVoiceParse, canFinishEdit, formatVoiceAmount, groupByStore, mixedCurrencyStore, storeLabel, storePayload,
  toggleMember, voiceCurrent, voiceTotal, type VoiceItem,
} from '@/lib/voice';
import { api } from '@/services/api';
import { colors } from '@/theme/tokens';
import { Input } from '@/components/Input';

const VOICE_LIMIT_MS = 60_000;
// 카테고리 시트 3열 순서(시안, 확인하고 나누기와 같다): 식비·교통·숙소 / 쇼핑·관광·기타
const CATEGORY_GRID: CategoryCode[] = ['food', 'transport', 'lodging', 'shopping', 'sightseeing', 'other'];

type Mic = 'idle' | 'rec' | 'parsing';

// api는 이미 UserError로 던진다. 아니면 변환한다.
const asUserError = (err: unknown): UserError =>
  typeof err === 'object' && err !== null && 'code' in err ? (err as UserError) : toUserError(err);

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function VoiceInput() {
  const topInset = useSafeAreaInsets().top;
  const { roomId, scheduleId } = useLocalSearchParams<{ roomId: string; scheduleId?: string }>();
  const { session, profile, refreshProfile } = useAuth();
  const { data: room } = useRoom(roomId);
  const { data: members } = useRoomMembers(roomId);
  const { data: scheduleItems = [] } = useScheduleItems(roomId);
  const { data: booking } = useTripBooking(roomId);
  const toast = useToast();
  const qc = useQueryClient();
  const navigation = useNavigation();

  const [items, setItems] = useState<VoiceItem[]>([]);
  const [sel, setSel] = useState<string | null>(null); // 보고 있는 가게(이름, '' = 이름 없는 가게)
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [mic, setMic] = useState<Mic>('idle');
  const [live, setLive] = useState('');
  const [misheard, setMisheard] = useState(false);
  const [permSheet, setPermSheet] = useState(false);
  const [noticeDone, setNoticeDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pool, setPool] = useState(false);
  const [date, setDate] = useState(localToday);
  // 공금 잔액(원)과 비교할 이번 기록의 원화 합계. 외화는 결제일 환율로 환산한다(노션 39번).
  const poolBalance = usePoolBalance(roomId);
  // ponytail: 외화는 처음 나온 한 통화만 환산한다. 두 외화가 섞이면 경고를 띄우지 않는다.
  const foreign = items.find((i) => i.currency !== 'KRW')?.currency ?? null;
  const fx = useFxPreview(foreign ? date : null, foreign);
  const needKrw = sumKrw(items, (a, c) => (c === foreign ? fx.toKrw(a) : null));
  const poolShort = pool && poolBalance !== null && needKrw !== null ? poolShortage(poolBalance, needKrw) : null;
  const [dateOpen, setDateOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  // 가게별로 고른 일정. 없으면 기본값 규칙(defaultScheduleId), null = [일정 없음]을 직접 골랐다.
  const [sched, setSched] = useState<Record<string, string | null>>({});
  const finalText = useRef('');
  const liveText = useRef('');

  const me = members?.find((m) => m.userId === session?.user.id && !m.leftAt);
  // 사람: 동행만(QR로만 들어온 사람·나간 사람 제외). 색은 참여자 목록 순서(members 화면과 같다).
  const people = (members ?? []).filter((m) => !m.leftAt && !m.spotOnly);
  const colorIndex = new Map((members ?? []).map((m, i) => [m.id, i]));

  const groups = groupByStore(items);
  const cur = groups.find((g) => g.store === sel) ?? groups[0];

  // 가게 이름이 바뀌면 보고 있는 가게·고른 일정도 따라간다.
  const followRenames = (pairs: { from: string; to: string }[]) => {
    if (!pairs.length) return;
    setSched((m) => {
      const next = { ...m };
      for (const { from, to } of pairs) {
        if (!(from in next)) continue;
        next[to] = next[from];
        delete next[from];
      }
      return next;
    });
    setSel((s) => pairs.find((p) => p.from === s)?.to ?? s);
  };

  async function recognize(text: string) {
    if (!room || !me) return;
    if (!text) {
      setMic('idle');
      setMisheard(true);
      return;
    }
    setMic('parsing');
    try {
      const parsed = await api.parseVoice({
        roomId, text, names: people.map((p) => p.name), stores: groups.map((g) => g.store).filter(Boolean),
        baseCurrency: room.base_currency, current: voiceCurrent(items, people, me.id),
      });
      const renames = parsed.renames ?? [];
      if (!parsed.items.length && !renames.length) {
        setMisheard(true);
        return;
      }
      const r = applyVoiceParse(items, parsed, { people, meId: me.id, newKey: uuidV4, fallbackStore: cur?.store ?? '' });
      setItems(r.items);
      followRenames(renames);
      if (r.added.length) setSel(r.added[0].store);
      // 금액을 못 들은 품목은 바로 편다.
      const noAmount = r.added.find((c) => !c.amount);
      if (noAmount) setOpenKey(noAmount.key);
      const newStores = new Set(r.added.map((a) => a.store).filter((s) => !groups.some((g) => g.store === s)));
      if (renames.length) toast('가게 이름을 바꿨어요');
      else if (r.updated && !r.added.length) toast(`품목 ${r.updated}개를 고쳤어요`);
      else if (newStores.size > 1) toast(`가게별로 ${newStores.size}건으로 정리했어요`);
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
    setOpenKey(null);
    setMic('rec');
    // 기기 STT만 쓴다. 음성 파일은 서버로 보내지 않는다(ADR-004).
    ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
  };
  const onMic = () => (mic === 'rec' ? ExpoSpeechRecognitionModule.stop() : mic === 'idle' ? void startRec() : undefined);

  const update = (key: string, patch: Partial<VoiceItem>) => setItems((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const remove = (key: string) => {
    setItems((cs) => cs.filter((c) => c.key !== key));
    setOpenKey(null);
    toast('품목을 삭제했어요');
  };
  const removeStore = (store: string) => {
    setItems((cs) => cs.filter((c) => (c.store ?? '') !== store));
    setOpenKey(null);
  };
  // 가게 이름 바꾸기. 이미 있는 가게 이름이면 그 가게로 합쳐진다.
  const renameStore = (from: string, to: string) => {
    const name = to.trim();
    if (name === from) return;
    if (groups.some((g) => g.store === name)) toast(name ? `${name} 지출에 합쳤어요` : '이름 없는 지출에 합쳤어요');
    setItems((cs) => cs.map((c) => ((c.store ?? '') === from ? { ...c, store: name } : c)));
    followRenames([{ from, to: name }]);
  };
  const addItem = () => {
    if (!cur) return;
    const key = uuidV4();
    setItems((cs) => [
      ...cs,
      { key, store: cur.store, memberIds: [me.id], title: '', quantity: 1, amount: 0, currency: room.base_currency, category: cur.items[0].category, part: '' },
    ]);
    setOpenKey(key);
  };

  // 결제일의 일정(시각순). 여행 후 날짜는 '여행 전'으로 접히지 않게 비운다.
  const startDate = room.start_date ?? null;
  const endDate = room.end_date ?? null;
  const dayIdx = dayIndexOfDate(date, startDate, endDate);
  const dayItems = tripDayTag(date, startDate, endDate) === '여행 후' ? [] : scheduleItems.filter((x) => x.dayIndex === dayIdx);
  const entry = scheduleItems.find((x) => x.id === scheduleId) ?? null;
  const schedOf = (store: string) =>
    store in sched ? sched[store] : defaultScheduleId({ dayItems, entryId: entry?.id ?? null, isPackage: !!booking, paidTime: null });
  const category = cur?.items[0].category ?? 'other';
  const curSched = cur ? schedOf(cur.store) : null;
  const schedItem = scheduleItems.find((x) => x.id === curSched) ?? null;

  const incomplete = items.some((i) => !canFinishEdit(i));
  const canSave = groups.length > 0 && !incomplete && mic === 'idle' && !saving;
  // 가게마다 한 건씩 저장하고, 저장된 가게는 목록에서 뺀다. 중간에 실패하면 남은 가게만 다시 저장하면 된다.
  const save = async () => {
    const mixed = mixedCurrencyStore(items);
    if (mixed !== null) {
      toast(`${mixed || '이름 없는 지출'}에 통화가 섞여 있어요. 한 통화로 맞춰 주세요`);
      return;
    }
    setOpenKey(null);
    setSaving(true);
    const n = groups.length;
    for (const g of groups) {
      try {
        const payload = storePayload(g.store, g.items, { roomId, meMemberId: me.id, todayLocal: date, expenseId: uuidV4(), newId: uuidV4, pool });
        const saved = await api.saveExpense(payload, null);
        const link = schedOf(g.store);
        if (link) await api.setExpenseMeta({ expenseId: saved.id, scheduleId: link });
        setItems((cs) => cs.filter((x) => (x.store ?? '') !== g.store));
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
    toast(poolShort ? `공금이 ${formatKrw(-poolShort.after)} 부족해요 · 공금 지갑에서 채워 주세요` : `지출 ${n}건을 저장했어요`);
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
  const parsing = mic === 'parsing';
  // 말한 내용은 인식이 끝날 때까지 남긴다(live는 다음 녹음을 시작할 때 비운다).
  const status = rec
    ? live
      ? `“${live}”`
      : '듣고 있어요'
    : parsing
      ? live
        ? `“${live}”`
        : 'AI가 가게별로 나누고 있어요'
      : misheard
        ? '잘 못 들었어요. 다시 말해 주세요'
        : '';
  const multi = people.length > 1;
  const isKrw = room.base_currency === 'KRW';
  const todayLocal = localToday();

  const micButton = (size: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rec ? '말하기 멈추기' : '말하기 시작'}
      disabled={mic === 'parsing'}
      onPress={onMic}
      style={{
        width: size,
        height: size,
        boxShadow: rec ? '0 0 0 10px rgba(217,33,72,.12)' : '0 8px 20px -8px rgba(19,25,39,.22)',
      }}
      className={`items-center justify-center rounded-full ${rec ? 'bg-danger' : 'bg-white'}`}
    >
      {mic === 'parsing' ? (
        <ActivityIndicator color={colors.ink.DEFAULT} />
      ) : (
        <Icon as={rec ? Pause : Microphone} size={Math.round(size * 0.34)} color={rec ? colors.primary.on : colors.ink.DEFAULT} />
      )}
    </Pressable>
  );

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: topInset }}>
      {/* 모달 화면이라 SafeAreaView(네이티브)가 위 여백을 0으로 재서 뒤로·제목이 상태바에 겹쳤다(2026-11-25 실기기). 앱 전체 기준 insets로 띄운다. */}
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

      <NavBar title="음성으로 기록" align="center" />

      {!cur ? (
        // 대기 화면(#19): 가운데 마이크 + 안내.
        <View className="flex-1 items-center justify-center gap-5 px-8 pb-20">
          {micButton(88)}
          <View className="items-center gap-1.5">
            <Text className="text-center font-semibold text-17 text-ink">{rec ? '듣고 있어요' : parsing && live ? `“${live}”` : '누가 무엇에 얼마 썼는지 말해 주세요'}</Text>
            <Text className={`text-center text-13 ${misheard && !rec ? 'text-danger' : 'text-ink-500'}`}>
              {rec ? live || ' ' : parsing ? 'AI가 가게별로 나누고 있어요' : misheard ? '잘 못 들었어요. 다시 말해 주세요' : '예: 지훈이 편의점 과자 5천 원'}
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-3 px-5 pt-1" contentContainerStyle={{ paddingBottom: 170 }} keyboardShouldPersistTaps="handled">
          {/* 개인/공금 토글(확인하고 나누기와 같다). 공금이 꺼진 여행에서 공금을 누르면 안내 시트(노션 39번). */}
          <PoolPayToggle
            value={pool ? 'pool' : 'member'}
            poolEnabled={room.pool_enabled}
            onChange={(k) => setPool(k === 'pool')}
            onSetup={() => router.push({ pathname: '/rooms/[roomId]/pool', params: { roomId, setup: '1' } })}
            shortage={poolShort}
          />

          {/* 가게 칩(#21): 고른 가게는 진한 바탕. ×는 그 가게를 지운다. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" keyboardShouldPersistTaps="handled">
            {groups.map((g) => {
              const on = g.store === cur.store;
              const label = storeLabel(g.store, g.items);
              return (
                <Pressable
                  key={g.store}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                  onPress={() => {
                    setSel(g.store);
                    setOpenKey(null);
                  }}
                  className={`h-9 flex-row items-center gap-1.5 rounded-full pl-3.5 pr-2.5 ${on ? 'bg-ink' : 'bg-white'}`}
                >
                  <Text className={`font-semibold text-13 ${on ? 'text-primary-on' : 'text-ink'}`}>{label}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${label} 삭제`} hitSlop={8} onPress={() => removeStore(g.store)}>
                    <Icon as={Xmark} size={14} color={on ? colors['on-dark-sub'] : colors.ink[300]} />
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 고른 가게 한 곳의 영수증 티켓 */}
          <View className="overflow-hidden rounded-t-box bg-white">
            <View className="flex-row items-center gap-3.5 px-5 pb-3 pt-5">
              <CategoryCircle code={category} size={40} />
              <View className="flex-1 gap-0.5">
                <StoreNameInput key={cur.store} store={cur.store} onDone={(to) => renameStore(cur.store, to)} />
                <Text style={{ fontVariant: ['tabular-nums'] }} className={`font-semibold text-22 ${isKrw ? 'text-ink' : 'text-local'}`}>
                  {voiceTotal(cur.items)}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="결제일" onPress={() => setDateOpen(true)} hitSlop={6} className="mt-0.5 flex-row items-center gap-1 self-start">
                  <Icon as={Calendar} size={14} color={colors.ink[500]} />
                  <Text className="text-13 text-ink-500">{shortDate(date)}</Text>
                  <Icon as={NavArrowDown} size={14} color={colors.ink[500]} />
                </Pressable>
              </View>
            </View>
            <Perforation />
            <Text className="px-5 pb-0.5 pt-1.5 font-semibold text-13 text-ink-500">품목 {cur.items.length}개</Text>
            {cur.items.map((c, i) => {
              const n = c.memberIds.length;
              const per = isKrw ? floorDiv(c.amount, n) : perPersonOriginal(c.amount, n);
              return (
                <ItemRow
                  key={c.key}
                  first={i === 0}
                  nameOriginal={c.part ? `“${c.part}”` : '직접 추가한 품목'}
                  nameKo={c.title}
                  quantity={c.quantity}
                  amountText={c.amount ? String(c.amount) : ''}
                  amountLabel={formatVoiceAmount(c.amount, c.currency)}
                  krwLabel={null}
                  isKrw={c.currency === 'KRW'}
                  needsReview={!canFinishEdit(c)}
                  people={multi ? people.map((p) => ({ id: p.id, name: p.name, colorIndex: colorIndex.get(p.id) ?? 0, guest: p.kind === 'guest', on: c.memberIds.includes(p.id) })) : []}
                  splitLabel={splitLabel(n, people.length, formatVoiceAmount(per, c.currency))}
                  expanded={openKey === c.key}
                  onToggleOpen={() => setOpenKey((k) => (k === c.key ? null : c.key))}
                  onChangeName={(title) => update(c.key, { title })}
                  onChangeAmount={(text) => {
                    const amount = parseAmountInput(text);
                    if (amount !== null && amount >= 0) update(c.key, { amount });
                  }}
                  onToggle={(id) => update(c.key, { memberIds: toggleMember(c.memberIds, id) })}
                  // [전원]: 누르면 전원, 이미 전원이면 나만 남긴다.
                  onAll={() => update(c.key, { memberIds: n === people.length ? [me.id] : people.map((p) => p.id) })}
                  onClearReview={() => setOpenKey(c.key)}
                  onRemove={() => remove(c.key)}
                />
              );
            })}
            <Pressable accessibilityRole="button" onPress={addItem} className="h-12 flex-row items-center justify-center gap-1 active:bg-app">
              <Icon as={Plus} size={16} color={colors.primary.text} />
              <Text className="font-semibold text-sm text-primary-text">품목 추가</Text>
            </Pressable>
            <WavyBottom />
          </View>

          {/* 카테고리·연결할 일정(가게마다 따로) */}
          <View className="overflow-hidden rounded-box bg-white">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`카테고리 · ${categoryLabel(category)}`}
              onPress={() => setCatOpen(true)}
              className="h-[52px] flex-row items-center justify-between gap-3 pl-4 pr-3 active:bg-app"
            >
              <Text className="text-15 text-ink-500">카테고리</Text>
              <View className="flex-row items-center gap-1.5">
                <CategoryCircle code={category} />
                <Text className="font-semibold text-15 text-ink">{categoryLabel(category)}</Text>
                <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
              </View>
            </Pressable>
            <View className="mx-4 h-px bg-muted" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="일정 고르기"
              onPress={() => setSchedOpen(true)}
              className="h-[52px] flex-row items-center justify-between gap-3 pl-4 pr-3 active:bg-app"
            >
              <Text className="text-15 text-ink-500">연결할 일정</Text>
              <View className="flex-shrink flex-row items-center gap-1.5">
                <Text numberOfLines={1} className="flex-shrink font-semibold text-15 text-ink">
                  {schedItem?.title ?? '일정 없음'}
                </Text>
                {!!schedItem && scheduleMatchesCategory(category, schedItem.title) && <Recommend />}
                <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
              </View>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {!!cur && (
        <BottomBar fade bg={colors.canvas}>
          {!!status && (
            <Text className={`text-center font-semibold text-13 ${rec ? 'text-danger' : 'text-ink-500'}`}>
              {status}
            </Text>
          )}
          {parsing && !!live && <Text className="text-center text-13 text-ink-500">AI가 가게별로 나누고 있어요</Text>}
          <View className="flex-row items-center gap-3">
            {micButton(56)}
            <View className="flex-1">
              <PrimaryButton title={`지출 ${groups.length}건 기록하기`} disabled={!canSave} loading={saving} onPress={() => void save()} />
            </View>
          </View>
        </BottomBar>
      )}

      <DateSheet
        visible={dateOpen}
        value={date}
        // 시차 때문에 '내일'까지는 허용한다(확인하고 나누기와 같은 기준)
        max={addDays(todayLocal, 1)}
        quick={[{ label: `오늘 ${todayLocal.slice(5).replace('-', '.')}`, date: todayLocal }]}
        band={startDate ? { start: startDate, end: endDate } : undefined}
        onPick={(d) => {
          setDate(d);
          setSched({}); // 결제일이 바뀌면 일정 선택을 기본값으로 되돌린다
          setDateOpen(false);
        }}
        onClose={() => setDateOpen(false)}
      />

      <BottomSheet visible={schedOpen} onClose={() => setSchedOpen(false)} title="어떤 일정에 넣을까요?" subtitle={`결제일 ${shortDate(date)}`}>
        <View className="flex-row flex-wrap gap-2">
          {[...dayItems, ...(entry && !dayItems.includes(entry) ? [entry] : [])].map((x) => {
            const on = curSched === x.id;
            return (
              <Pressable
                key={x.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  if (cur) setSched((m) => ({ ...m, [cur.store]: x.id }));
                  setSchedOpen(false);
                }}
                className={`h-9 flex-row items-center gap-[5px] rounded-full border px-3 ${on ? 'border-primary-text bg-sky-50' : 'border-line bg-white'}`}
              >
                {on && <Icon as={Check} size={14} color={colors.primary.text} />}
                <Text className={`font-semibold text-sm ${on ? 'text-primary-text' : 'text-ink'}`}>{x.title}</Text>
                {scheduleMatchesCategory(category, x.title) && <Recommend />}
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: curSched === null }}
            onPress={() => {
              if (cur) setSched((m) => ({ ...m, [cur.store]: null }));
              setSchedOpen(false);
            }}
            className={`h-9 flex-row items-center gap-[5px] rounded-full border px-3 ${curSched === null ? 'border-primary-text bg-sky-50' : 'border-line bg-white'}`}
          >
            {curSched === null && <Icon as={Check} size={14} color={colors.primary.text} />}
            <Text className={`font-semibold text-sm ${curSched === null ? 'text-primary-text' : 'text-ink'}`}>일정 없음</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <BottomSheet visible={catOpen} onClose={() => setCatOpen(false)} title="카테고리">
        <View className="flex-row flex-wrap justify-between gap-y-2.5">
          {CATEGORY_GRID.map((code) => {
            const on = category === code;
            return (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={categoryLabel(code)}
                onPress={() => {
                  // 지출 1건 = 카테고리 하나. 고른 가게의 품목 전부에 넣는다(storePayload는 첫 품목 것을 쓴다).
                  if (cur) setItems((cs) => cs.map((c) => ((c.store ?? '') === cur.store ? { ...c, category: code } : c)));
                  setCatOpen(false);
                }}
                style={{ width: '31.5%' }}
                className={`h-[88px] items-center justify-center gap-2 rounded-button border ${on ? 'border-primary bg-sky-50' : 'border-line bg-white active:bg-app'}`}
              >
                <CategoryCircle code={code} size={36} />
                <Text className={`font-semibold text-13 ${on ? 'text-primary-text' : 'text-ink'}`}>{categoryLabel(code)}</Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

// 가게 이름. 비어 있으면 '어디서 사용했나요? (선택)'. 다 쓰면(키보드 완료·포커스 해제) 반영한다.
function StoreNameInput({ store, onDone }: { store: string; onDone: (to: string) => void }) {
  const [name, setName] = useState(store);
  return (
    <Input
      value={name}
      onChangeText={setName}
      onEndEditing={() => onDone(name)}
      placeholder="어디서 사용했나요? (선택)"
      maxLength={80}
      returnKeyType="done"
      accessibilityLabel="가게 이름"
      className="p-0 font-semibold text-input-16 text-ink"
    />
  );
}

// 카테고리↔일정 이름이 맞을 때의 노란 '✦ 추천' 라벨(자동 선택 아님). 확인하고 나누기와 같은 모양.
function Recommend() {
  return (
    <View className="rounded-badge bg-warning-bg px-1.5 py-0.5">
      <Text className="font-semibold text-11 text-warning-text">✦ 추천</Text>
    </View>
  );
}
