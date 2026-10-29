import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssigneeSheet } from '@/components/AssigneeSheet';
import { Avatar, GuestChip } from '@/components/Avatar';
import type { AvatarPerson } from '@/components/AvatarStack';
import { Badge } from '@/components/Badge';
import { ItemBox } from '@/components/ItemBox';
import { PrimaryButton } from '@/components/PrimaryButton';
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
import { formatForeign, formatKrw, fxBasisLabel } from '@/lib/money';
import { uuidV4 } from '@/lib/uuid';
import { api } from '@/services/api';
import { copyReceipt } from '@/services/storage';

const DUP_WINDOW_MS = 72 * 3600_000;

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

  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 쪼개기는 기존 박스 금액을 바꾸므로 금액 입력칸을 다시 그린다.
  const [splitRev, setSplitRev] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<Section, number>>>({});

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
      router.back();
    } catch (err) {
      setError(asUserError(err).message);
    }
  };

  // 기존 지출의 박스는 그대로, 사진만 기존 지출 폴더로 옮겨 덧붙인다. 작성 중 지출은 버린다.
  const onMerge = async (c: DupCandidate) => {
    setError(null);
    try {
      const { payload, version } = await api.expensePayload(c.id);
      const photos = await Promise.all(
        draft.photos.map(async (p) => ({ storage_path: await copyReceipt(p.storagePath, roomId, c.id), kind: p.kind })),
      );
      await save.mutateAsync({ payload: mergePayload(payload, draft, photos), expectedVersion: version });
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

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      <ScrollView ref={scrollRef} contentContainerClassName="gap-6 px-5 pb-6 pt-4" keyboardShouldPersistTaps="handled">
        {dup && (
          <View className="rounded-lg border border-line bg-sky-100 p-4">
            <Text className="text-[15px] text-ink-900">{describeDuplicate(dup, localToday())} 지출과 같은 결제인가요?</Text>
            <View className="mt-3 flex-row gap-2">
              <Pressable accessibilityRole="button" onPress={() => void onMerge(dup)} className="h-11 flex-1 items-center justify-center rounded-xl bg-sky-800">
                <Text className="font-bold text-[15px] text-ink-900">합치기</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setDupDismissed(true)} className="h-11 flex-1 items-center justify-center rounded-xl bg-sky-200">
                <Text className="font-semibold text-[15px] text-ink-900">별개예요</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View onLayout={(e) => setY('top', e)} className="gap-2">
          {draft.needsReview && (
            <Badge kind="review" onPress={() => update((d) => ({ ...d, needsReview: false }))} accessibilityLabel="확인 필요 해제" />
          )}
          <TextInput
            value={draft.merchant}
            onChangeText={(merchant) => update((d) => ({ ...d, merchant }))}
            placeholder="가맹점"
            accessibilityLabel="가맹점"
            className="font-bold text-[22px] text-ink-900"
          />
        </View>

        <View onLayout={(e) => setY('date', e)} className="gap-2">
          <Text className="font-semibold text-[17px] text-ink-900">결제일</Text>
          <TextInput
            value={draft.paidLocalDate}
            onChangeText={(paidLocalDate) => update((d) => ({ ...d, paidLocalDate }))}
            placeholder="YYYY-MM-DD"
            accessibilityLabel="결제일"
            keyboardType="numbers-and-punctuation"
            className="h-12 rounded-lg border border-input-line bg-white px-4 text-base text-ink-900 focus:border-sky-800 focus:bg-sky-100"
          />
        </View>

        <View onLayout={(e) => setY('currency', e)} className="gap-2">
          <Text className="font-semibold text-[17px] text-ink-900">통화</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {CURRENCIES.map((c) => (
              <Chip key={c.code} label={c.code} selected={draft.currency === c.code} onPress={() => update((d) => ({ ...d, currency: c.code }))} />
            ))}
          </ScrollView>
        </View>

        <View onLayout={(e) => setY('payer', e)} className="gap-2">
          <Text className="font-semibold text-[17px] text-ink-900">결제자</Text>
          <View className="flex-row flex-wrap gap-2">
            {active.map((p) => (
              <Chip
                key={p.id}
                label={p.userId === session?.user.id ? `${p.name}(나)` : p.guest ? `${p.name}(게스트)` : p.name}
                selected={draft.payerKind === 'member' && draft.payerMemberId === p.id}
                onPress={() => update((d) => ({ ...d, payerKind: 'member', payerMemberId: p.id }))}
              />
            ))}
            {/* 공금이 켜져 있으면 '공금'도 결제자로 고를 수 있다. 꺼진 뒤 열린 공금 지출도 선택 상태를 보여준다. */}
            {(room?.pool_enabled || draft.payerKind === 'pool') && (
              <Chip
                label="공금"
                selected={draft.payerKind === 'pool'}
                onPress={() => update((d) => ({ ...d, payerKind: 'pool', payerMemberId: null }))}
              />
            )}
          </View>
        </View>

        {multi && (
          <View onLayout={(e) => setY('scope', e)} className="gap-2">
            <Text className="font-semibold text-[17px] text-ink-900">대상 인원</Text>
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
                    <Text className="text-[13px] text-ink-700">{p.name}</Text>
                    {p.guest && <GuestChip />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View className="rounded-lg bg-sky-200 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-[15px] text-ink-700">합계 {formatForeign(sumOriginal, draft.currency)}</Text>
            {preview ? (
              <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-base text-ink-900">
                약 {formatKrw(preview.totalKrw)}
              </Text>
            ) : (
              fxPending && <Badge kind="pending" />
            )}
          </View>
          {fx.fx && !draft.krwCharged && (
            <Text className="mt-1 text-[13px] text-ink-500">
              {fxBasisLabel({ source: fx.fx.source, baseDate: fx.fx.base_date, rate: fx.fx.rate, currency: draft.currency })}
            </Text>
          )}
          <Text className="mt-1 text-[13px] text-ink-500">미리보기 — 저장 시 확정돼요</Text>
        </View>

        <View onLayout={(e) => setY('items', e)} className="gap-2">
          {draft.items.map((it, i) => (
            <ItemBox
              key={`${it.id}:${splitRev}`}
              nameOriginal={it.nameOriginal}
              nameKo={it.nameKo}
              quantity={it.quantity}
              amountText={String(it.amountOriginal)}
              krwPreview={preview ? formatKrw(preview.boxKrw[i]) : null}
              needsReview={it.needsReview}
              assignees={it.assigneeMemberIds.flatMap((id) => byId.get(id) ?? [])}
              showAssign={multi}
              onChangeName={(nameKo) => update((d) => updateItem(d, it.id, { nameKo }))}
              onChangeAmount={(text) => {
                const amountOriginal = parseAmountInput(text);
                if (amountOriginal !== null) update((d) => updateItem(d, it.id, { amountOriginal }));
              }}
              onAssign={() => setAssignFor(it.id)}
              onClearReview={() => update((d) => updateItem(d, it.id, { needsReview: false }))}
              onSplit={() => {
                update((d) => splitItem(d, it.id, uuidV4));
                setSplitRev((r) => r + 1);
              }}
            />
          ))}
          <Pressable accessibilityRole="button" onPress={() => update((d) => addItem(d, uuidV4))} className="h-11 justify-center self-start">
            <Text className="font-medium text-[15px] text-sky-900">품목 추가</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View className="gap-2 border-t border-divider px-5 pt-3">
        {error && <Text className="text-sm text-minus">{error}</Text>}
        <PrimaryButton title="저장" onPress={() => void onSave()} disabled={save.isPending || updateExpense.isPending} />
      </View>

      <AssigneeSheet
        visible={!!assignItem}
        people={scopePeople}
        selected={assignItem?.assigneeMemberIds ?? []}
        summary={assignSummary}
        onToggle={(id) => {
          if (!assignItem) return;
          const cur = assignItem.assigneeMemberIds;
          update((d) => setAssignees(d, assignItem.id, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
        }}
        onClose={() => setAssignFor(null)}
      />
    </SafeAreaView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-11 items-center justify-center rounded-md px-4 ${selected ? 'bg-sky-300' : 'bg-sky-100'}`}
    >
      <Text className="font-semibold text-[15px] text-ink-900">{label}</Text>
    </Pressable>
  );
}
