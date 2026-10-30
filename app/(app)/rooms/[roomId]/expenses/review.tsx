import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Copy, Plus, Xmark } from 'iconoir-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssigneeSheet } from '@/components/AssigneeSheet';
import { Avatar, GuestChip } from '@/components/Avatar';
import type { AvatarPerson } from '@/components/AvatarStack';
import { Badge } from '@/components/Badge';
import { ItemBox } from '@/components/ItemBox';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { BottomBar, PrimaryButton } from '@/components/PrimaryButton';
import { ReceiptThumb } from '@/components/ReceiptThumb';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useDraft, useSaveExpense } from '@/hooks/useDraft';
import { useUpdateExpense } from '@/hooks/useExpense';
import { useFxPreview } from '@/hooks/useFxPreview';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { CURRENCIES } from '@/lib/currency';
import { describeDuplicate, findDuplicate, type DupCandidate } from '@/lib/duplicate';
import { toUserError, type UserError } from '@/lib/errors';
import {
  addItem,
  draftFromExpense,
  kstToday,
  mergePayload,
  parseAmountInput,
  perPersonOriginal,
  previewKrw,
  setAssignees,
  splitItem,
  toDupInput,
  toggleScope,
  toSavePayload,
  updateItem,
  validateDraft,
  type ExpenseDraft,
} from '@/lib/expenseForm';
import { floorDiv, formatForeign, formatKrw, fxBasisLabel } from '@/lib/money';
import { uuidV4 } from '@/lib/uuid';
import { api } from '@/services/api';
import { copyReceipt, signedUrl } from '@/services/storage';
import { colors } from '@/theme/tokens';
import type { RoomMember } from '@/types/domain';

const DUP_WINDOW_MS = 72 * 3600_000;
// 서명 URL은 10분짜리라 9분 지나면 다시 받는다(ARCHITECTURE §4).
const SIGNED_URL_STALE_MS = 9 * 60_000;

type Section = 'top' | 'date' | 'currency' | 'payer' | 'scope' | 'items';
const FIELD_SECTION: Record<string, Section> = {
  currency: 'currency',
  paidLocalDate: 'date',
  payer: 'payer',
  items: 'items',
  krwCharged: 'items',
};

// 기기 현지 날짜(중복 배너의 "오늘·어제" 기준).
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const asUserError = (err: unknown): UserError =>
  typeof err === 'object' && err !== null && 'code' in err ? (err as UserError) : toUserError(err);

export default function ReviewExpense() {
  // edit가 있으면 저장된 지출을 고치는 편집 모드. 편집 draft는 메모리에만 두고 기기의 작성 중 지출과 섞지 않는다.
  const { roomId, edit, version } = useLocalSearchParams<{ roomId: string; edit?: string; version?: string }>();
  const { session } = useAuth();
  const { data: members } = useRoomMembers(roomId);
  const { data: room } = useRoom(roomId);
  const { stored, setStored, loaded } = useDraft(roomId);
  const save = useSaveExpense(roomId);
  const updateExpense = useUpdateExpense();
  const [editing, setEditing] = useState<{ draft: ExpenseDraft; version: number } | null>(null);
  const draft = edit ? (editing?.draft ?? null) : (stored?.draft ?? null);

  const toast = useToast();
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [dupDismissed, setDupDismissed] = useState(false);
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

  // 작성 중 지출이 없으면(저장·폐기 후 다시 열림) 장부 홈으로 돌아간다.
  useEffect(() => {
    if (!edit && loaded && !stored) router.back();
  }, [edit, loaded, stored]);

  // 편집 모드: 상세 화면에서 본 version을 기대값으로 쓴다. 그 사이 바뀌었으면 저장 때 VERSION_CONFLICT가 난다.
  useEffect(() => {
    if (!edit) return;
    api.expensePayload(edit).then(
      ({ payload }) => setEditing({ draft: draftFromExpense(payload), version: Number(version) }),
      (err: unknown) => setError(asUserError(err).message),
    );
  }, [edit, version]);

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
  const byId = new Map(people.map((p) => [p.id, p]));
  const active = people.filter((p) => p.active);
  const scopePeople = draft.scopeMemberIds.flatMap((id) => byId.get(id) ?? []);
  const multi = active.length > 1;

  const preview = previewKrw(draft, fx.fx?.rate ?? null);
  const fxPending = fxNeeded && !fx.isFetching && !fx.fx;
  const sumOriginal = toDupInput(draft, null).amountOriginal;

  const dup = dupDismissed || edit
    ? null
    : findDuplicate(toDupInput(draft, preview?.totalKrw ?? null), (recent ?? []).filter((c) => c.id !== draft.id), new Date());

  const scrollTo = (s: Section) => scrollRef.current?.scrollTo({ y: sectionY.current[s] ?? 0, animated: true });
  const setY = (s: Section, e: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[s] = e.nativeEvent.layout.y;
  };

  const onSave = async () => {
    const v = validateDraft(draft, kstToday(new Date()));
    if (!v.ok) {
      setError(toUserError({ message: v.code }).message);
      scrollTo(v.code === 'SCOPE_EMPTY' ? 'scope' : (FIELD_SECTION[v.field ?? ''] ?? 'top'));
      return;
    }
    setError(null);
    if (edit && editing) {
      try {
        await updateExpense.mutateAsync({ payload: toSavePayload(draft), expectedVersion: editing.version });
        toast('지출을 저장했어요');
        router.back();
      } catch (err) {
        const e = asUserError(err);
        setError(e.message);
        // 덮어쓰지 않는다: 최신 지출과 version으로 draft를 바꾸고, 사용자가 다시 고쳐 저장한다.
        if (e.code === 'VERSION_CONFLICT') {
          const latest = await api.expensePayload(edit).catch(() => null);
          if (latest) {
            setEditing({ draft: draftFromExpense(latest.payload), version: latest.version });
            setSplitRev((r) => r + 1);
          }
        }
      }
      return;
    }
    try {
      await save.mutateAsync({ payload: toSavePayload(draft), expectedVersion: null });
      toast('지출을 저장했어요');
      router.back();
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
      router.back();
    } catch (err) {
      setError(asUserError(err).message);
    }
  };

  const assignItem = draft.items.find((it) => it.id === assignFor);
  const assignSummary = (() => {
    if (!assignItem) return '';
    const n = assignItem.assigneeMemberIds.length || draft.scopeMemberIds.length;
    return `${n}명 · 1인 ${formatForeign(perPersonOriginal(assignItem.amountOriginal, n), draft.currency)}`;
  })();

  const total = preview ? formatKrw(preview.totalKrw) : null;
  const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(draft.paidLocalDate)
    ? `${Number(draft.paidLocalDate.slice(5, 7))}월 ${Number(draft.paidLocalDate.slice(8, 10))}일 · `
    : '';
  const splitLabel = (i: number) => {
    const it = draft.items[i];
    const n = it.assigneeMemberIds.length;
    if (!n) return '전원 1/N';
    const per = preview ? formatKrw(floorDiv(preview.boxKrw[i], n)) : formatForeign(perPersonOriginal(it.amountOriginal, n), draft.currency);
    return `${n}명 · 1인 ${per}`;
  };
  const toggleAssignee = (itemId: string, memberId: string) =>
    update((d) => {
      const cur = d.items.find((x) => x.id === itemId)?.assigneeMemberIds ?? [];
      return setAssignees(d, itemId, cur.includes(memberId) ? cur.filter((x) => x !== memberId) : [...cur, memberId]);
    });
  // 칩이 한 줄(약 4명)을 넘으면 사람 지정 시트로 고른다.
  const chipsFit = scopePeople.length <= 4;

  return (
    <SafeAreaView className="flex-1 bg-app" edges={['top']}>
      <NavBar title={edit ? '지출 수정' : '확인하고 나누기'} align="center" />
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="gap-3.5 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
      >
        {dup && <DupBanner dup={dup} members={members} onMerge={onMerge} onDismiss={() => setDupDismissed(true)} />}

        <View onLayout={(e) => setY('top', e)} className="flex-row items-center gap-3.5 rounded-card bg-white p-[18px]">
          <ReceiptThumb uri={thumb} />
          <View className="flex-1 gap-[3px]">
            <View className="flex-row items-center gap-1.5">
              <TextInput
                value={draft.merchant}
                onChangeText={(merchant) => update((d) => ({ ...d, merchant }))}
                placeholder="가맹점"
                placeholderTextColor={colors.ink[300]}
                accessibilityLabel="가맹점"
                className="flex-shrink p-0 font-bold text-[17px] text-ink"
              />
              {draft.needsReview && (
                <Badge kind="review" onPress={() => update((d) => ({ ...d, needsReview: false }))} accessibilityLabel="확인 필요 해제" />
              )}
            </View>
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Text className="text-sm text-ink-500">
                {dateLabel}
                {draft.currency === 'KRW' ? '' : formatForeign(sumOriginal, draft.currency)}
                {total && (
                  <>
                    {draft.currency === 'KRW' ? '' : ' → '}
                    <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-ink">
                      {total}
                    </Text>
                  </>
                )}
              </Text>
              {!total && fxPending && <Badge kind="pending" />}
            </View>
            {fx.fx && !draft.krwCharged && (
              <Text className="text-xs text-primary-text">
                {fxBasisLabel({ source: fx.fx.source, baseDate: fx.fx.base_date, rate: fx.fx.rate, currency: draft.currency })}
              </Text>
            )}
          </View>
        </View>

        <View onLayout={(e) => setY('date', e)} className="gap-4 rounded-card bg-white p-4">
          <View className="gap-2">
            <Text className="font-semibold text-[13px] text-ink-500">결제일</Text>
            <TextInput
              value={draft.paidLocalDate}
              onChangeText={(paidLocalDate) => update((d) => ({ ...d, paidLocalDate }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.ink[300]}
              accessibilityLabel="결제일"
              keyboardType="numbers-and-punctuation"
              className="h-[54px] rounded-input border-[1.5px] border-line bg-white px-4 text-base text-ink focus:border-primary"
            />
          </View>
          <View onLayout={(e) => setY('currency', e)} className="gap-2">
            <Text className="font-semibold text-[13px] text-ink-500">통화</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {CURRENCIES.map((c) => {
                const on = draft.currency === c.code;
                return (
                  <Pressable
                    key={c.code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => update((d) => ({ ...d, currency: c.code }))}
                    className={`h-11 justify-center rounded-[12px] border-[1.5px] px-3.5 ${on ? 'border-primary bg-sky-50' : 'border-line bg-white'}`}
                  >
                    <Text className={`font-semibold text-[15px] ${on ? 'text-primary-text' : 'text-ink-500'}`}>{c.code}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <View onLayout={(e) => setY('payer', e)} className="flex-row items-start justify-between gap-3 px-1 pt-1">
          <Text className="mt-1.5 font-bold text-sm text-ink">결제한 사람</Text>
          <View className="flex-1 flex-row flex-wrap justify-end gap-1.5">
            {active.map((p) => (
              <PayerPill
                key={p.id}
                label={p.userId === session?.user.id ? `${p.name}(나)` : p.guest ? `${p.name}(게스트)` : p.name}
                selected={draft.payerKind === 'member' && draft.payerMemberId === p.id}
                onPress={() => update((d) => ({ ...d, payerKind: 'member', payerMemberId: p.id }))}
              />
            ))}
            {/* 공금이 켜져 있으면 '공금'도 결제자로 고를 수 있다. 꺼진 뒤 열린 공금 지출도 선택 상태를 보여준다. */}
            {(room?.pool_enabled || draft.payerKind === 'pool') && (
              <PayerPill
                label="공금"
                selected={draft.payerKind === 'pool'}
                onPress={() => update((d) => ({ ...d, payerKind: 'pool', payerMemberId: null }))}
              />
            )}
          </View>
        </View>

        {multi && (
          <View onLayout={(e) => setY('scope', e)} className="gap-2.5 px-1">
            <Text className="font-bold text-sm text-ink">대상 인원</Text>
            <View className="flex-row flex-wrap gap-3">
              {active.map((p) => {
                const on = draft.scopeMemberIds.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`대상 인원 ${p.name}`}
                    onPress={() => update((d) => toggleScope(d, p.id))}
                    className={`min-h-11 items-center gap-1 ${on ? '' : 'opacity-40'}`}
                  >
                    <Avatar name={p.name} colorIndex={p.colorIndex} guest={p.guest} size={36} />
                    <Text className="font-medium text-xs text-ink-700">{p.name}</Text>
                    {p.guest && <GuestChip />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {multi && <Text className="px-1 text-[13px] text-ink-400">박스마다 먹은 사람을 눌러주세요. 안 누르면 전원이 1/N로 나눠요.</Text>}

        <View onLayout={(e) => setY('items', e)} className="gap-3.5">
          {draft.items.map((it, i) => (
            <ItemBox
              key={`${it.id}:${splitRev}`}
              nameOriginal={it.nameOriginal}
              nameKo={it.nameKo}
              quantity={it.quantity}
              amountLabel={formatForeign(it.amountOriginal, draft.currency)}
              amountText={String(it.amountOriginal)}
              krwLabel={preview ? formatKrw(preview.boxKrw[i]) : null}
              needsReview={it.needsReview}
              people={multi ? scopePeople.map((p) => ({ ...p, on: it.assigneeMemberIds.includes(p.id) })) : []}
              splitLabel={multi ? splitLabel(i) : ''}
              onChangeName={(nameKo) => update((d) => updateItem(d, it.id, { nameKo }))}
              onChangeAmount={(text) => {
                const amountOriginal = parseAmountInput(text);
                if (amountOriginal !== null) update((d) => updateItem(d, it.id, { amountOriginal }));
              }}
              onToggle={multi && chipsFit ? (id) => toggleAssignee(it.id, id) : undefined}
              onAssign={multi && !chipsFit ? () => setAssignFor(it.id) : undefined}
              onClearReview={() => update((d) => updateItem(d, it.id, { needsReview: false }))}
              onSplit={() => {
                update((d) => splitItem(d, it.id, uuidV4));
                setSplitRev((r) => r + 1);
              }}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => update((d) => addItem(d, uuidV4))}
            style={{ borderStyle: 'dashed' }}
            className="h-12 flex-row items-center justify-center gap-1.5 rounded-card border-[1.5px] border-line-off active:bg-muted"
          >
            <Icon as={Plus} size={20} color={colors.ink[500]} />
            <Text className="font-semibold text-[15px] text-ink-500">품목 추가</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomBar shadow>
        {error && <Text className="text-[13px] text-danger-text">{error}</Text>}
        <PrimaryButton
          title={total ? `${total} 저장하기` : '저장하기'}
          onPress={() => void onSave()}
          disabled={save.isPending || updateExpense.isPending}
        />
      </BottomBar>

      <AssigneeSheet
        visible={!!assignItem}
        people={scopePeople}
        selected={assignItem?.assigneeMemberIds ?? []}
        summary={assignSummary}
        onToggle={(id) => assignItem && toggleAssignee(assignItem.id, id)}
        onClose={() => setAssignFor(null)}
      />
    </SafeAreaView>
  );
}

function PayerPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-8 justify-center rounded-full px-3 ${selected ? 'bg-ink' : 'bg-white'}`}
    >
      <Text className={`font-bold text-[13px] ${selected ? 'text-white' : 'text-ink-500'}`}>{label}</Text>
    </Pressable>
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
      <Text className="flex-1 text-[13px] leading-[18px] text-warning-deep">
        {by ? `${by}님이 올린 ` : ''}
        <Text className="font-bold">{describeDuplicate(dup, localToday())}</Text> 기록과 같은 결제 같아요
      </Text>
      <Pressable accessibilityRole="button" onPress={() => void onMerge(dup, by)} className="rounded-badge bg-white px-2.5 py-1.5">
        <Text className="font-bold text-[13px] text-warning">합치기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="별개예요" onPress={onDismiss} hitSlop={8}>
        <Icon as={Xmark} size={18} color={colors.warning.DEFAULT} />
      </Pressable>
    </View>
  );
}
