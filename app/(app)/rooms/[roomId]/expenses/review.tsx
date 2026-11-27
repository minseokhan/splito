import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, Check, Copy, InfoCircle, NavArrowDown, NavArrowRight, Plus, Xmark } from 'iconoir-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AvatarPerson } from '@/components/AvatarStack';
import { Badge } from '@/components/Badge';
import { DateSheet } from '@/components/DateSheet';
import { Icon } from '@/components/Icon';
import { CategoryCircle } from '@/components/CategoryCircle';
import { NavBar } from '@/components/NavBar';
import { PoolPayToggle } from '@/components/PoolPayToggle';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { BottomSheet } from '@/components/BottomSheet';
import { ReceiptThumb } from '@/components/ReceiptThumb';
import { ItemRow } from '@/components/review/ItemRow';
import { Perforation, WavyBottom } from '@/components/review/TicketEdge';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useScheduleItems, useTripBooking } from '@/hooks/useBooking';
import { useDraft, useSaveExpense } from '@/hooks/useDraft';
import { useUpdateExpense } from '@/hooks/useExpense';
import { useFxPreview } from '@/hooks/useFxPreview';
import { usePoolBalance } from '@/hooks/usePool';
import { useMyBudget, useMyShares } from '@/hooks/useBudget';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { addDays, shortDate, tripDayTag } from '@/lib/calendar';
import { budgetStats, myShareOfDraft, overRecWarning } from '@/lib/budget';
import { categoryLabel, type CategoryCode } from '@/lib/category';
import { describeDuplicate, findDuplicate, type DupCandidate } from '@/lib/duplicate';
import { toUserError, type UserError } from '@/lib/errors';
import {
  addItem,
  defaultScheduleId,
  draftFromExpense,
  effScope,
  kstToday,
  mergePayload,
  mergeSplit,
  parseAmountInput,
  perPersonOriginal,
  previewKrw,
  previewVisibility,
  removeItem,
  scheduleMatchesCategory,
  setAssignees,
  splitItem,
  splitLabel,
  toDupInput,
  toggleWho,
  toSavePayload,
  updateItem,
  validateDraft,
  type ExpenseDraft,
} from '@/lib/expenseForm';
import { floorDiv, formatForeign, formatKrw, fxBasisLabel } from '@/lib/money';
import { poolShortage } from '@/lib/pool';
import { dayIndexOfDate } from '@/lib/schedule';
import { uuidV4 } from '@/lib/uuid';
import { api } from '@/services/api';
import { copyReceipt, signedUrl } from '@/services/storage';
import { colors } from '@/theme/tokens';
import type { RoomMember, SaveExpensePayload } from '@/types/domain';
import { Input } from '@/components/Input';

const DUP_WINDOW_MS = 72 * 3600_000;
// 서명 URL은 10분짜리라 9분 지나면 다시 받는다(ARCHITECTURE §4).
const SIGNED_URL_STALE_MS = 9 * 60_000;

type Section = 'top' | 'items';
const FIELD_SECTION: Record<string, Section> = {
  items: 'items',
  krwCharged: 'items',
};
// 카테고리 시트 3열 순서(시안): 식비·교통·숙소 / 쇼핑·관광·기타
const CATEGORY_GRID: CategoryCode[] = ['food', 'transport', 'lodging', 'shopping', 'sightseeing', 'other'];

// 기기 현지 날짜(중복 배너의 "오늘·어제" 기준).
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const asUserError = (err: unknown): UserError =>
  typeof err === 'object' && err !== null && 'code' in err ? (err as UserError) : toUserError(err);

export default function ReviewExpense() {
  const { roomId, scheduleId } = useLocalSearchParams<{ roomId: string; scheduleId?: string }>();
  return <ExpenseEditor roomId={roomId} scheduleId={scheduleId} />;
}

type EditorProps = {
  roomId: string;
  scheduleId?: string;
  // 아래는 지출 상세(노션 12번): 저장된 지출을 그 자리에서 고친다. 편집 draft는 메모리에만 두고 기기의 작성 중 지출과 섞지 않는다.
  edit?: string;
  /** 상세에서 본 version. 바뀌면(환율 재확정 등) 저장된 지출을 다시 불러온다. */
  version?: number;
  linkedScheduleId?: string | null;
  navRight?: ReactNode;
  deleteButton?: ReactNode;
  /** 상세 전용 시트·다이얼로그 */
  children?: ReactNode;
};

export function ExpenseEditor({ roomId, scheduleId, edit, version, linkedScheduleId = null, navRight, deleteButton, children }: EditorProps) {
  const { session } = useAuth();
  const { data: members } = useRoomMembers(roomId);
  const { data: room } = useRoom(roomId);
  // 예산 안내(명세 §8). 예산이 없으면 아무것도 안 뜨고, 저장을 막지도 않는다.
  const { data: budget } = useMyBudget(roomId);
  const { data: myShares } = useMyShares(roomId);
  // 공금 잔액 경고(노션 39번). 편집 중인 지출은 빼고 새 금액으로 비교한다.
  const poolBalance = usePoolBalance(roomId, edit);
  const { stored, setStored, loaded } = useDraft(roomId);
  const save = useSaveExpense(roomId);
  const updateExpense = useUpdateExpense();
  const qc = useQueryClient();
  // scope = 저장된 대상 인원. QR로 들어온 사람이 품목 지정 없이 대상에만 있어도 고칠 때 떨어지지 않게 한다.
  const [editing, setEditing] = useState<{ draft: ExpenseDraft; version: number; initial: string; scope: string[] } | null>(null);
  const meMemberId = members?.find((m) => m.userId === session?.user.id && !m.leftAt)?.id ?? null;
  const rawDraft = edit ? (editing?.draft ?? null) : (stored?.draft ?? null);
  // 올릴 곳을 바꾼 직후에는 결제자가 비어 있다(참여자 id가 방마다 다르다). 새 방의 내 id로 채운다.
  const draft =
    rawDraft && rawDraft.payerKind === 'member' && !rawDraft.payerMemberId && meMemberId
      ? { ...rawDraft, payerMemberId: meMemberId }
      : rawDraft;

  const toast = useToast();
  const [dateOpen, setDateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  // 품목 줄은 한 번에 하나만 펼친다. 처음 들어오면 '확인필요' 중 첫 줄을 펼친다(18번 ④).
  const [openBox, setOpenBox] = useState<string | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [fxTip, setFxTip] = useState(false);
  // ── 일정 연결(18번 ⑤). entry = 일정 상세의 [+ 지출]로 들어온 일정. 결제일을 바꾸면 선택값과 함께 초기화한다.
  const { data: scheduleItems = [] } = useScheduleItems(roomId);
  const { data: booking } = useTripBooking(roomId);
  const [entry, setEntry] = useState<string | null>(scheduleId ?? null);
  // undefined = 기본값 규칙을 따른다, null = [일정 없음]을 직접 골랐다
  const [pickedSchedule, setPickedSchedule] = useState<string | null | undefined>(edit ? linkedScheduleId : undefined);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const target = scheduleItems.find((x) => x.id === entry) ?? null;
  // 포함 사항에 식사가 있으면 '따로 결제한 게 맞나요?' 한 줄만 보여주고 저장은 막지 않는다.
  const mealWarn = target?.includes.find((l) => /^[조중석]식 포함$/.test(l))?.slice(0, 2) ?? null;
  const [dateConflict, setDateConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 쪼개기는 기존 박스 금액을 바꾸므로 금액 입력칸을 다시 그린다.
  const [splitRev, setSplitRev] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<Section, number>>>({});

  // 썸네일: 작성 중이면 기기 사본, 편집이면 저장된 사진의 서명 URL.
  const editPhoto = edit ? draft?.photos[0]?.storagePath : undefined;
  const { data: editPhotoUrl } = useQuery({
    queryKey: ['photo', editPhoto],
    queryFn: () => signedUrl(editPhoto!),
    enabled: !!editPhoto,
    staleTime: SIGNED_URL_STALE_MS,
  });
  const thumb = edit ? editPhotoUrl : stored?.localPhotos[0];

  const fxNeeded = !!draft && draft.currency !== 'KRW' && draft.krwCharged === null && /^[A-Z]{3}$/.test(draft.currency);
  const fx = useFxPreview(fxNeeded ? draft.paidLocalDate : null, fxNeeded ? draft.currency : null);
  const { data: recent } = useQuery({
    queryKey: ['room', roomId, 'recent'],
    queryFn: () => api.recentExpenses(roomId, new Date(Date.now() - DUP_WINDOW_MS).toISOString()),
  });

  // 결제일 달력의 [영수증 날짜] 칩: 처음 불러온 결제일
  const [receiptDate, setReceiptDate] = useState<string | null>(null);
  if (draft && receiptDate === null) setReceiptDate(draft.paidLocalDate);
  if (draft && !autoOpened) {
    setAutoOpened(true);
    const first = draft.items.find((it) => it.needsReview);
    if (first) setOpenBox(first.id);
  }

  // 작성 중 지출이 없으면(저장·폐기 후 다시 열림) 장부 홈으로 돌아간다.
  useEffect(() => {
    if (!edit && loaded && !stored) router.back();
  }, [edit, loaded, stored]);

  // 편집 모드: 불러온 version을 기대값으로 쓴다. 그 사이 바뀌었으면 저장 때 VERSION_CONFLICT가 난다.
  const loadEditing = useCallback((payload: SaveExpensePayload, v: number) => {
    const d = draftFromExpense(payload);
    setEditing({ draft: d, version: v, initial: JSON.stringify(d), scope: payload.scope_member_ids });
    setSplitRev((r) => r + 1);
  }, []);
  useEffect(() => {
    if (!edit) return;
    api.expensePayload(edit).then(
      ({ payload, version: v }) => loadEditing(payload, v),
      (err: unknown) => setError(asUserError(err).message),
    );
  }, [edit, version, loadEditing]);

  if (!draft || !members) return null;

  const update = (f: (d: ExpenseDraft) => ExpenseDraft) =>
    edit
      ? setEditing((s) => (s ? { ...s, draft: f(s.draft) } : s))
      : setStored((s) => (s ? { ...s, draft: f(s.draft) } : s));

  const people: (AvatarPerson & { active: boolean; userId: string | null })[] = members.map((m, i) => ({
    id: m.id,
    name: m.name,
    colorIndex: i,
    guest: m.kind === 'guest',
    active: !m.leftAt,
    userId: m.userId,
  }));
  // QR로 들어온 사람은 동행이 아니라 그 한 자리의 사람이다 — 새 지출에서는 고를 수 없다.
  // 다만 **이미 이 지출에 들어 있으면** 고를 수 있어야 한다. 못 고르면 effScope가 그 사람을
  // 대상 인원에서 떨어뜨려(지정 없는 박스는 '활동 참여자 전원'으로 채워진다) 금액이 조용히 바뀐다.
  const inThisExpense = new Set([...draft.items.flatMap((it) => it.assigneeMemberIds), ...(editing?.scope ?? [])]);
  const spotOnly = new Set(
    members.filter((m) => m.spotOnly && !inThisExpense.has(m.id)).map((m) => m.id),
  );
  const active = people.filter((p) => p.active && !spotOnly.has(p.id));
  const activeIds = active.map((p) => p.id);
  const multi = active.length > 1;

  const visibility = previewVisibility(draft, meMemberId, activeIds);
  const preview = previewKrw(draft, fx.fx?.rate ?? null);
  const fxPending = fxNeeded && !fx.isFetching && !fx.fx;
  // 기록은 막지 않는다. 저장하면 공금이 마이너스가 된다는 경고와 저장 후 토스트에만 쓴다.
  const poolShort = draft.payerKind === 'pool' && poolBalance !== null && preview ? poolShortage(poolBalance, preview.totalKrw) : null;
  const savedToast = (fallback: string) =>
    poolShort ? `공금이 ${formatKrw(-poolShort.after)} 부족해요 · 공금 지갑에서 채워 주세요` : fallback;
  const sumOriginal = toDupInput(draft, null).amountOriginal;

  const dup = dupDismissed || edit
    ? null
    : findDuplicate(toDupInput(draft, preview?.totalKrw ?? null), (recent ?? []).filter((c) => c.id !== draft.id), new Date());

  // 작성 모드는 방법 선택 화면이 스택에 남아 있을 수 있다(직접 입력). 저장 후에는 그 위까지 걷어내고 장부로 돌아간다.
  const leave = () => (edit ? router.back() : router.dismissTo({ pathname: '/rooms/[roomId]', params: { roomId } }));

  const scrollTo = (s: Section) => scrollRef.current?.scrollTo({ y: sectionY.current[s] ?? 0, animated: true });
  const setY = (s: Section, e: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[s] = e.nativeEvent.layout.y;
  };

  // 결제일의 일정(시각순). 여행 후 날짜는 '여행 전'으로 접히지 않게 비운다.
  const startDate = room?.start_date ?? null;
  const endDate = room?.end_date ?? null;
  const dayTag = tripDayTag(draft.paidLocalDate, startDate, endDate);
  const dayIdx = dayIndexOfDate(draft.paidLocalDate, startDate, endDate);
  const dayItems = dayTag === '여행 후' ? [] : scheduleItems.filter((x) => x.dayIndex === dayIdx);
  const scheduleSel =
    pickedSchedule !== undefined
      ? pickedSchedule
      : defaultScheduleId({ dayItems, entryId: entry, isPackage: !!booking, paidTime: draft.paidLocalTime });
  const selItem = scheduleItems.find((x) => x.id === scheduleSel) ?? null;
  // 편집 모드는 불러온 그대로면 저장할 게 없다. 처음 불러온 draft·일정과 다를 때만 [수정하기]를 켠다.
  const unchanged = !!editing && JSON.stringify(editing.draft) === editing.initial && scheduleSel === linkedScheduleId;

  // 일정 상세에서 들어온 일정의 날짜가 결제일과 다르면 어디에 넣을지 먼저 묻는다(명세 §7).
  const onSave = async () => {
    if (
      target &&
      scheduleSel === target.id &&
      !dateConflict &&
      dayIndexOfDate(draft.paidLocalDate, room?.start_date ?? null, room?.end_date ?? null) !== target.dayIndex
    ) {
      const v0 = validateDraft(draft, kstToday(new Date()));
      if (v0.ok) {
        setDateConflict(true);
        return;
      }
    }
    await commit(scheduleSel);
  };

  const commit = async (linkTo: string | null) => {
    setDateConflict(false);
    const v = validateDraft(draft, kstToday(new Date()));
    if (!v.ok) {
      setError(toUserError({ message: v.code }).message);
      scrollTo(FIELD_SECTION[v.field ?? ''] ?? 'top');
      return;
    }
    setError(null);
    if (edit && editing) {
      try {
        await updateExpense.mutateAsync({ payload: toSavePayload(draft, meMemberId, activeIds), expectedVersion: editing.version });
        // 일정 연결은 save_expense가 건드리지 않는 표시용 메타라 바뀌었을 때만 따로 붙인다(새 지출과 같은 RPC).
        if (linkTo !== linkedScheduleId) {
          await api.setExpenseMeta({ expenseId: edit, scheduleId: linkTo });
          void qc.invalidateQueries({ queryKey: ['room', roomId] });
        }
        toast(savedToast('지출을 수정했어요'));
        router.back();
      } catch (err) {
        const e = asUserError(err);
        setError(e.message);
        // 덮어쓰지 않는다: 최신 지출과 version으로 draft를 바꾸고, 사용자가 다시 고쳐 저장한다.
        if (e.code === 'VERSION_CONFLICT') {
          const latest = await api.expensePayload(edit).catch(() => null);
          if (latest) loadEditing(latest.payload, latest.version);
        }
      }
      return;
    }
    try {
      const saved = await save.mutateAsync({ payload: toSavePayload(draft, meMemberId, activeIds), expectedVersion: null });
      // 금액·배분은 save_expense가 확정했다. 연결은 표시용 메타라 따로 붙인다.
      if (linkTo) await api.setExpenseMeta({ expenseId: saved.id, scheduleId: linkTo });
      const linked = scheduleItems.find((x) => x.id === linkTo);
      toast(savedToast(linked ? `‘${linked.title}’에 연결했어요` : '지출을 저장했어요'));
      leave();
    } catch (err) {
      setError(asUserError(err).message);
    }
  };

  // 기존 지출의 박스는 그대로, 사진만 기존 지출 폴더로 옮겨 덧붙인다. 작성 중 지출은 버린다.
  const onMerge = async (c: DupCandidate, by: string | null) => {
    setError(null);
    try {
      const { payload, version } = await api.expensePayload(c.id);
      const photos = await Promise.all(
        draft.photos.map(async (p) => ({ storage_path: await copyReceipt(p.storagePath, roomId, c.id), kind: p.kind })),
      );
      await save.mutateAsync({ payload: mergePayload(payload, draft, photos), expectedVersion: version });
      toast(by ? `${by}님 기록과 합쳤어요` : '기존 기록과 합쳤어요');
      leave();
    } catch (err) {
      setError(asUserError(err).message);
    }
  };

  const total = preview ? formatKrw(preview.totalKrw) : null;
  const isKrw = draft.currency === 'KRW';
  const pickedDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.paidLocalDate) ? draft.paidLocalDate : null;
  const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(draft.paidLocalDate)
    ? `${Number(draft.paidLocalDate.slice(5, 7))}월 ${Number(draft.paidLocalDate.slice(8, 10))}일`
    : '';
  // 결제일이 속한 일차. 0이면 여행 기간 밖이라 '여행 전'으로 넣는다(명세 §7).
  const conflictDay = dayIndexOfDate(draft.paidLocalDate, room?.start_date ?? null, room?.end_date ?? null);
  const conflictDayLabel = conflictDay === 0 ? '여행 전' : `${conflictDay}일차`;
  // 저장하면 오늘 권장액을 넘는지(명세 §8·§9-4). 결제일이 오늘일 때만 뜻이 있다.
  const todayLocal = kstToday(new Date());
  const budgetWarn =
    draft.paidLocalDate === todayLocal && room?.start_date
      ? overRecWarning(
          budgetStats({
            budget: budget?.totalKrw ?? null,
            shares: myShares ?? [],
            startDate: room.start_date,
            endDate: room.end_date,
            today: todayLocal,
          }),
          myShareOfDraft({
            boxKrw: preview?.boxKrw ?? [],
            items: draft.items,
            scopeMemberIds: effScope(draft, meMemberId, activeIds),
            payerMemberId: draft.payerKind === 'member' ? draft.payerMemberId : null,
            meMemberId,
          }),
        )
      : null;
  const itemSplitLabel = (i: number) => {
    const it = draft.items[i];
    const n = it.assigneeMemberIds.length || active.length;
    const per = preview ? formatKrw(floorDiv(preview.boxKrw[i], n)) : formatForeign(perPersonOriginal(it.amountOriginal, n), draft.currency);
    return splitLabel(n, active.length, per);
  };
  // 사람을 고르면 확인필요 배지도 내린다(시안).
  const toggleAssignee = (itemId: string, memberId: string) => {
    const cur = draft.items.find((x) => x.id === itemId)?.assigneeMemberIds ?? [];
    const next = toggleWho(cur, memberId, activeIds);
    if (!next) return toast('한 명 이상 골라 주세요');
    update((d) => updateItem(setAssignees(d, itemId, next), itemId, { needsReview: false }));
  };
  // [전원]: 누르면 전원, 이미 전원이면 나만 남긴다.
  const allAssignees = (itemId: string) => {
    const cur = draft.items.find((x) => x.id === itemId)?.assigneeMemberIds ?? [];
    const next = cur.length === 0 && meMemberId && activeIds.includes(meMemberId) ? [meMemberId] : [];
    update((d) => updateItem(setAssignees(d, itemId, next), itemId, { needsReview: false }));
  };
  const itemName = (it: ExpenseDraft['items'][number]) => it.nameKo || it.nameOriginal || '품목';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <NavBar title={edit ? '지출 상세' : '확인하고 나누기'} align="center" right={navRight} />
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="gap-3 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: 170 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ② 개인/공금 토글(시안: 항상 보인다). 개인 = 올린 사람(나)이 결제. 공금이 꺼진 여행에서 공금을 누르면 안내 시트(노션 39번). */}
        <PoolPayToggle
          value={draft.payerKind}
          poolEnabled={!!room?.pool_enabled}
          onChange={(k) =>
            update((d) => (k === 'pool' ? { ...d, payerKind: 'pool', payerMemberId: null } : { ...d, payerKind: 'member', payerMemberId: meMemberId }))
          }
          onSetup={() => router.push({ pathname: '/rooms/[roomId]/pool', params: { roomId, setup: '1' } })}
          shortage={poolShort}
        />

        {/* ③ 영수증 티켓: 요약 + 중복 배너 + 절취선 + 품목 */}
        <View onLayout={(e) => setY('top', e)} className="overflow-hidden rounded-t-box bg-white">
          <View className="flex-row items-center gap-3.5 px-5 pb-3 pt-5">
            <Pressable accessibilityRole="imagebutton" accessibilityLabel="영수증 크게 보기" disabled={!thumb} onPress={() => setZoom(true)}>
              <ReceiptThumb uri={thumb} />
            </Pressable>
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-1.5">
                <Input
                  value={draft.merchant}
                  onChangeText={(merchant) => update((d) => ({ ...d, merchant }))}
                  placeholder="어디서 사용했나요? (선택)"
                  accessibilityLabel="가맹점"
                  className="flex-shrink p-0 font-semibold text-input-16 text-ink"
                />
                {draft.needsReview && (
                  <Badge kind="review" onPress={() => update((d) => ({ ...d, needsReview: false }))} accessibilityLabel="확인 필요 해제" />
                )}
              </View>
              {/* 결제 통화를 크게(#1272BF), 원화는 옆에 작게 회색. 원화 결제는 원화만. */}
              <View style={{ zIndex: 10 }} className="relative flex-row flex-wrap items-center gap-1.5">
                {isKrw ? (
                  total && (
                    <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-22 text-ink">
                      {total}
                    </Text>
                  )
                ) : (
                  <>
                    <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-22 text-local">
                      {formatForeign(sumOriginal, draft.currency)}
                    </Text>
                    {total && (
                      <Text style={{ fontVariant: ['tabular-nums'] }} className="text-sm text-ink-300">
                        {total}
                      </Text>
                    )}
                    {fx.fx && !draft.krwCharged && (
                      <Pressable accessibilityRole="button" accessibilityLabel="환율 근거" onPress={() => setFxTip((v) => !v)} hitSlop={4} className="h-6 w-6 items-center justify-center">
                        <Icon as={InfoCircle} size={16} color={fxTip ? colors.info.DEFAULT : colors.ink[300]} />
                      </Pressable>
                    )}
                  </>
                )}
                {!total && fxPending && <Badge kind="pending" />}
                {/* 환율 근거는 금액 줄 아래에 떠서 아래 내용을 밀지 않는다(시안). */}
                {fxTip && fx.fx && !draft.krwCharged && (
                  <View
                    style={{ boxShadow: '0 8px 20px -10px rgba(18,168,119,.35)', elevation: 4 }}
                    className="absolute left-0 top-full mt-1 rounded-badge bg-info-bg px-2.5 py-2"
                  >
                    <Text numberOfLines={1} className="font-semibold text-xs text-info">
                      {fxBasisLabel({ source: fx.fx.source, baseDate: fx.fx.base_date, rate: fx.fx.rate, currency: draft.currency })}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="결제일" onPress={() => setDateOpen(true)} hitSlop={6} className="mt-0.5 flex-row items-center gap-1 self-start">
                <Icon as={Calendar} size={14} color={colors.ink[500]} />
                <Text className={`text-13 ${pickedDate ? 'text-ink-500' : 'text-ink-300'}`}>{pickedDate ? shortDate(pickedDate) : '날짜 선택'}</Text>
                <Icon as={NavArrowDown} size={14} color={colors.ink[500]} />
              </Pressable>
            </View>
          </View>
          {dup && (
            <View className="mx-5 mb-2">
              <DupBanner dup={dup} members={members} onMerge={onMerge} onDismiss={() => setDupDismissed(true)} />
            </View>
          )}
          <Perforation />
          <View onLayout={(e) => setY('items', e)}>
            <Text className="px-5 pb-0.5 pt-1.5 font-semibold text-13 text-ink-500">품목 {draft.items.length}개</Text>
            {draft.items.map((it, i) => (
              <ItemRow
                key={`${it.id}:${splitRev}`}
                first={i === 0}
                nameOriginal={it.nameOriginal}
                nameKo={it.nameKo}
                quantity={it.quantity}
                amountLabel={formatForeign(it.amountOriginal, draft.currency)}
                amountText={it.amountOriginal ? String(it.amountOriginal) : ''}
                krwLabel={preview ? formatKrw(preview.boxKrw[i]) : null}
                needsReview={it.needsReview}
                isKrw={isKrw}
                people={multi ? active.map((p) => ({ ...p, on: it.assigneeMemberIds.includes(p.id) })) : []}
                splitLabel={multi ? itemSplitLabel(i) : ''}
                expanded={openBox === it.id}
                onToggleOpen={() => setOpenBox((o) => (o === it.id ? null : it.id))}
                // 품목명이나 금액을 채우면 '확인 필요'를 푼다(37번).
                onChangeName={(nameKo) => update((d) => updateItem(d, it.id, nameKo.trim() ? { nameKo, needsReview: false } : { nameKo }))}
                onChangeAmount={(text) => {
                  // 비우면 0(총액에서 바로 빠진다)
                  const amountOriginal = text ? parseAmountInput(text) : 0;
                  if (amountOriginal !== null) update((d) => updateItem(d, it.id, amountOriginal ? { amountOriginal, needsReview: false } : { amountOriginal }));
                }}
                onChangeQuantity={(quantity) => update((d) => updateItem(d, it.id, { quantity }))}
                onToggle={(id) => toggleAssignee(it.id, id)}
                onAll={() => allAssignees(it.id)}
                onClearReview={() => update((d) => updateItem(d, it.id, { needsReview: false }))}
                onSplit={() => {
                  update((d) => splitItem(d, it.id, uuidV4));
                  setSplitRev((r) => r + 1);
                  setOpenBox(null);
                  toast(`‘${itemName(it)}’을 ${it.quantity}개로 쪼갰어요`);
                }}
                onMerge={
                  it.splitFrom
                    ? () => {
                        const orig = it.splitFrom!;
                        update((d) => mergeSplit(d, it.id));
                        setSplitRev((r) => r + 1);
                        setOpenBox(null);
                        toast(`‘${itemName(orig)}${orig.quantity > 1 ? ` ×${orig.quantity}` : ''}’로 다시 합쳤어요`);
                      }
                    : undefined
                }
                // 마지막 한 품목은 지울 수 없다(품목 0개 지출은 저장 불가)
                onRemove={
                  draft.items.length > 1
                    ? () => {
                        update((d) => removeItem(d, it.id));
                        setOpenBox(null);
                        toast(`‘${itemName(it)}’ 품목을 삭제했어요`);
                      }
                    : undefined
                }
              />
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => update((d) => addItem(d, uuidV4))}
              className="h-12 flex-row items-center justify-center gap-1 active:bg-app"
            >
              <Icon as={Plus} size={16} color={colors.primary.text} />
              <Text className="font-semibold text-sm text-primary-text">품목 추가</Text>
            </Pressable>
          </View>
          <WavyBottom />
        </View>

        {/* ⑤ 카테고리·일정 카드(시안). 일정 연결은 저장 뒤 메타로 붙인다. */}
        <View className="overflow-hidden rounded-box bg-white">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`카테고리 · ${categoryLabel(draft.category)}`}
            onPress={() => setCategoryOpen(true)}
            className="h-[52px] flex-row items-center justify-between gap-3 pl-4 pr-3 active:bg-app"
          >
            <Text className="text-15 text-ink-500">카테고리</Text>
            <View className="flex-row items-center gap-1.5">
              <CategoryCircle code={draft.category} />
              <Text className="font-semibold text-15 text-ink">{categoryLabel(draft.category)}</Text>
              <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
            </View>
          </Pressable>
          <View className="mx-4 h-px bg-muted" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="일정 고르기"
            onPress={() => setScheduleOpen(true)}
            className="h-[52px] flex-row items-center justify-between gap-3 pl-4 pr-3 active:bg-app"
          >
            <Text className="text-15 text-ink-500">연결할 일정</Text>
            <View className="flex-shrink flex-row items-center gap-1.5">
              <Text numberOfLines={1} className="flex-shrink font-semibold text-15 text-ink">
                {selItem?.title ?? '일정 없음'}
              </Text>
              {!!selItem && scheduleMatchesCategory(draft.category, selItem.title) && <Recommend />}
              <Icon as={NavArrowRight} size={16} color={colors.ink[300]} />
            </View>
          </Pressable>
        </View>

        {multi && visibility === 'private' && <Text className="px-1 text-right text-13 text-ink-400">나만 보기 · 정산에서 빠져요</Text>}
      </ScrollView>

      <BottomBar fade>
        {!!mealWarn && (
          <View className="flex-row items-center gap-1.5">
            <Icon as={InfoCircle} size={16} color={colors.warning.DEFAULT} />
            <Text className="flex-1 text-13 text-warning-text">이 일정은 {mealWarn}이 포함돼 있어요. 따로 결제한 게 맞나요?</Text>
          </View>
        )}
        {!!budgetWarn && <Text className="text-13 text-warning-accent">{budgetWarn}</Text>}
        {error && <Text className="text-13 text-danger-text">{error}</Text>}
        {edit ? (
          <View className="flex-row gap-2">
            {deleteButton}
            <PrimaryButton title="수정하기" grow onPress={() => void onSave()} disabled={updateExpense.isPending || unchanged} />
          </View>
        ) : (
          <PrimaryButton
            title={total ? `${total} 기록하기` : '기록하기'}
            onPress={() => void onSave()}
            disabled={save.isPending}
          />
        )}
      </BottomBar>

      <BottomSheet
        visible={dateConflict}
        onClose={() => setDateConflict(false)}
        title="이 일정에 넣을까요?"
        subtitle={
          target
            ? `결제일은 ${dateLabel}인데, ‘${target.title}’ 일정은 ${target.dayIndex}일차예요.`
            : ''
        }
      >
        <View className="gap-2">
          <PrimaryButton title="이 일정에 넣기" variant="dark" onPress={() => void commit(scheduleSel)} />
          <PrimaryButton
            title={`결제일(${conflictDayLabel}) 그 외 지출로 넣기`}
            variant="muted"
            size="md"
            onPress={() => void commit(null)}
          />
        </View>
      </BottomSheet>

      <DateSheet
        visible={dateOpen}
        value={draft.paidLocalDate}
        // 시차 때문에 '내일'까지는 허용한다(validateDraft와 같은 기준)
        max={addDays(todayLocal, 1)}
        quick={[
          ...(receiptDate && /^\d{4}-\d{2}-\d{2}$/.test(receiptDate)
            ? [{ label: `영수증 날짜 ${receiptDate.slice(5).replace('-', '.')}`, date: receiptDate }]
            : []),
          { label: `오늘 ${todayLocal.slice(5).replace('-', '.')}`, date: todayLocal },
        ]}
        band={startDate ? { start: startDate, end: endDate } : undefined}
        resultLabel={(d) => {
          const tag = tripDayTag(d, startDate, endDate);
          return tag ? `${shortDate(d)} · ${tag}` : shortDate(d);
        }}
        onPick={(paidLocalDate) => {
          setDateOpen(false);
          if (paidLocalDate === draft.paidLocalDate) return;
          // 결제일이 바뀌면 일정 선택값을 초기화한다. 환율은 결제일 키로 다시 불러온다(useFxPreview).
          update((d) => ({ ...d, paidLocalDate }));
          setEntry(null);
          setPickedSchedule(undefined);
          toast(`결제일을 ${shortDate(paidLocalDate)}로 바꿨어요`);
        }}
        onClose={() => setDateOpen(false)}
      />

      <BottomSheet visible={scheduleOpen} onClose={() => setScheduleOpen(false)} title="어떤 일정에 넣을까요?" subtitle={dateLabel ? `결제일 ${dateLabel}` : undefined}>
        <View className="flex-row flex-wrap gap-2">
          {[...dayItems, ...(target && !dayItems.includes(target) ? [target] : [])].map((x) => {
            const on = scheduleSel === x.id;
            return (
              <Pressable
                key={x.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setPickedSchedule(x.id);
                  setScheduleOpen(false);
                }}
                className={`h-9 flex-row items-center gap-[5px] rounded-full border px-3 ${on ? 'border-primary-text bg-sky-50' : 'border-line bg-white'}`}
              >
                {on && <Icon as={Check} size={14} color={colors.primary.text} />}
                <Text className={`font-semibold text-sm ${on ? 'text-primary-text' : 'text-ink'}`}>{x.title}</Text>
                {scheduleMatchesCategory(draft.category, x.title) && <Recommend />}
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: scheduleSel === null }}
            onPress={() => {
              setPickedSchedule(null);
              setScheduleOpen(false);
            }}
            className={`h-9 flex-row items-center gap-[5px] rounded-full border px-3 ${scheduleSel === null ? 'border-primary-text bg-sky-50' : 'border-line bg-white'}`}
          >
            {scheduleSel === null && <Icon as={Check} size={14} color={colors.primary.text} />}
            <Text className={`font-semibold text-sm ${scheduleSel === null ? 'text-primary-text' : 'text-ink'}`}>일정 없음</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <BottomSheet visible={categoryOpen} onClose={() => setCategoryOpen(false)} title="카테고리">
        <View className="flex-row flex-wrap justify-between gap-y-2.5">
          {CATEGORY_GRID.map((code) => {
            const on = draft.category === code;
            return (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={categoryLabel(code)}
                onPress={() => {
                  update((d) => ({ ...d, category: code }));
                  setCategoryOpen(false);
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

      {/* 영수증 크게 보기. 핀치 줌은 ScrollView 줌(iOS)으로 한다. 지출 상세의 원본 사진 보기와 같은 모양. */}
      <Modal visible={zoom && !!thumb} onRequestClose={() => setZoom(false)} animationType="fade">
        <SafeAreaView className="flex-1 bg-black">
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setZoom(false)} className="self-end p-3">
            <Icon as={Xmark} size={26} color="#FFFFFF" />
          </Pressable>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerClassName="flex-1">
            {!!thumb && <Image source={{ uri: thumb }} resizeMode="contain" className="h-full w-full" />}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {children}
    </SafeAreaView>
  );
}

// 카테고리↔일정 이름이 맞을 때의 노란 '✦ 추천' 라벨(자동 선택 아님).
function Recommend() {
  return (
    <View className="rounded-badge bg-warning-bg px-1.5 py-0.5">
      <Text className="font-semibold text-11 text-warning-text">✦ 추천</Text>
    </View>
  );
}

// 중복 의심 배너. 제안만 하고 자동으로 합치지 않는다. 올린 사람 이름은 기존 지출의 created_by로 찾는다.
function DupBanner({
  dup,
  members,
  onMerge,
  onDismiss,
}: {
  dup: DupCandidate;
  members: RoomMember[];
  onMerge: (c: DupCandidate, by: string | null) => Promise<void>;
  onDismiss: () => void;
}) {
  const { data } = useQuery({ queryKey: ['expense', dup.id], queryFn: () => api.expense(dup.id) });
  const by = members.find((m) => m.userId && m.userId === data?.created_by)?.name ?? null;
  return (
    <View className="flex-row items-center gap-2.5 rounded-button bg-warning-banner px-3.5 py-3">
      <Icon as={Copy} size={20} color={colors.warning.DEFAULT} />
      <Text className="flex-1 text-13 text-warning-deep">
        {by ? `${by}님이 올린 ` : ''}
        <Text className="font-semibold">{describeDuplicate(dup, localToday())}</Text> 기록과 같은 결제 같아요
      </Text>
      <Pressable accessibilityRole="button" onPress={() => void onMerge(dup, by)} className="rounded-badge bg-white px-2.5 py-1.5">
        <Text className="font-semibold text-13 text-warning-text">합치기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="별개예요" onPress={onDismiss} hitSlop={8}>
        <Icon as={Xmark} size={18} color={colors.warning.DEFAULT} />
      </Pressable>
    </View>
  );
}
