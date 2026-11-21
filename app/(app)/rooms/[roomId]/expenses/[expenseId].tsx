import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { InfoCircle, SendDiagonal, Trash, WarningCircle, Xmark } from 'iconoir-react-native';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarStack, type AvatarPerson } from '@/components/AvatarStack';
import { Badge } from '@/components/Badge';
import { BottomSheet } from '@/components/BottomSheet';
import { CategoryCircle } from '@/components/CategoryCircle';
import { Icon } from '@/components/Icon';
import { ItemBox } from '@/components/ItemBox';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ReceiptThumb } from '@/components/ReceiptThumb';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useScheduleItems } from '@/hooks/useBooking';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useAddComment, useComments, useDeleteComment } from '@/hooks/useComments';
import { useDeleteExpense, useExpense, useExpenseHistory, useSetItemAssignees } from '@/hooks/useExpense';
import { useReconfirmPendingFx } from '@/hooks/useFeed';
import { useRoom, useRoomMembers } from '@/hooks/useRooms';
import { useTransfers } from '@/hooks/useSettlement';
import { useRoomSpotSettles } from '@/hooks/useSpotSettle';
import { commentSchema } from '@/lib/activity';
import { toCategory } from '@/lib/category';
import { toUserError, type UserError } from '@/lib/errors';
import { perPersonOriginal, splitLabel, toggleWho } from '@/lib/expenseForm';
import { diffSnapshots, historyStamp } from '@/lib/history';
import { floorDiv, formatForeign, formatKrw, fxBasisLabel } from '@/lib/money';
import { dayIndexOfDate } from '@/lib/schedule';
import { md } from '@/lib/tripDays';
import { uuidV4 } from '@/lib/uuid';
import { signedUrl } from '@/services/storage';
import { colors } from '@/theme/tokens';
import type { FxSource } from '@/types/domain';

// 서명 URL은 10분짜리라 9분 지나면 다시 받는다(ARCHITECTURE §4).
const SIGNED_URL_STALE_MS = 9 * 60_000;

const asUserError = (err: unknown): UserError =>
  typeof err === 'object' && err !== null && 'code' in err ? (err as UserError) : toUserError(err);

export default function ExpenseDetailScreen() {
  const { roomId, expenseId } = useLocalSearchParams<{ roomId: string; expenseId: string }>();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { data: e, error: loadError } = useExpense(expenseId);
  const { data: history } = useExpenseHistory(expenseId);
  const { data: members = [] } = useRoomMembers(roomId);
  const reconfirm = useReconfirmPendingFx(roomId);
  const del = useDeleteExpense();
  const toast = useToast();
  const { data: room } = useRoom(roomId);
  const { data: schedule = [] } = useScheduleItems(roomId);
  const { data: transfers = [] } = useTransfers(roomId);
  const { data: spots = [] } = useRoomSpotSettles(roomId);
  const myId = useAuth().session?.user.id;
  const { data: comments = [] } = useComments(expenseId);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const [draft, setDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<string[]>([]); // 먹은 사람을 펼쳐 본 품목
  // 품목별 '누가 먹었는지' 편집. null이면 손대지 않은 상태 — 저장 버튼도 안 띄운다.
  const [pick, setPick] = useState<Record<string, string[]> | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const saveAssignees = useSetItemAssignees(roomId, expenseId);

  const paths = e?.expense_photos.map((p) => p.storage_path) ?? [];
  const { data: photoUrls } = useQuery({
    queryKey: ['expense', expenseId, 'photos', paths],
    queryFn: () => Promise.all(paths.map(signedUrl)),
    enabled: paths.length > 0,
    staleTime: SIGNED_URL_STALE_MS,
  });

  // 열 때 환율 대기면 fx-rate로 캐시를 채운 뒤 서버가 재확정한다(한 번만).
  const reconfirmed = useRef(false);
  useEffect(() => {
    if (!e || e.fx_source !== 'pending' || reconfirmed.current) return;
    reconfirmed.current = true;
    reconfirm.mutate([{ paidLocalDate: e.paid_local_date, currency: e.currency }], {
      onSettled: () => qc.invalidateQueries({ queryKey: ['expense', expenseId] }),
    });
  }, [e, reconfirm, qc, expenseId]);

  if (!e) {
    return loadError ? (
      <SafeAreaView className="flex-1 bg-app" edges={['top']}>
        <NavBar />
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-base text-ink-500">지출을 찾을 수 없어요</Text>
        </View>
      </SafeAreaView>
    ) : null;
  }

  const people = new Map<string, AvatarPerson>(
    members.map((m, i) => [m.id, { id: m.id, name: m.name, colorIndex: i, guest: m.kind === 'guest' }]),
  );
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const userName = new Map(members.flatMap((m) => (m.userId ? [[m.userId, m.name] as const] : [])));
  const payerName = e.payer_kind === 'pool' ? '공금' : (names[e.payer_member_id ?? ''] ?? '참여자');
  const scopePeople = e.expense_scope.flatMap((s) => people.get(s.member_id) ?? []);
  const fxSource = e.fx_source as FxSource;
  const amountOriginal = Number(e.amount_original);
  const isKrw = e.currency === 'KRW';

  // 메타 줄: '2일차 · 10.21 (화) 12:40 · 민지 결제 · 도톤보리 먹방' / '여행 전 21:10 · 서연 결제'
  const day = dayIndexOfDate(e.paid_local_date, room?.start_date ?? null, room?.end_date ?? null);
  const dow = '일월화수목금토'[new Date(`${e.paid_local_date}T00:00:00Z`).getUTCDay()];
  const dateText = `${md(e.paid_local_date)} (${dow})`;
  const when = [
    !room?.start_date ? dateText : day === 0 ? '여행 전' : `${day}일차 · ${dateText}`,
    e.paid_local_time?.slice(0, 5),
  ]
    .filter(Boolean)
    .join(' ');
  const scheduleTitle = schedule.find((s) => s.id === e.schedule_id)?.title;
  const meta = [when, `${payerName} 결제`, scheduleTitle].filter(Boolean).join(' · ');

  // 삭제 규칙(노션 12번). 올린 사람이나 결제자 본인만 지울 수 있다.
  const payerUserId = members.find((m) => m.id === e.payer_member_id)?.userId;
  const canDelete = !!myId && (e.created_by === myId || (e.payer_kind !== 'pool' && payerUserId === myId));
  const spotSent = spots.some((s) => s.sentAt && s.expenses.some((x) => x.id === e.id && x.selected));
  // ponytail: 송금은 지출과 직접 묶여 있지 않다. 이 지출이 올라온 뒤 완료된 송금이 있으면 '정산에 포함'으로 본다.
  const settled = transfers.some((t) => t.confirmedAt && !t.voidedAt && t.createdAt >= e.created_at);
  const deletable = canDelete && !spotSent;

  const onDelete = () => {
    setConfirmDelete(false);
    setError(null);
    del.mutate(
      { roomId, id: e.id, expectedVersion: e.version },
      {
        onSuccess: () => {
          toast('지출을 삭제했어요');
          router.back();
        },
        onError: (err) => {
          setError(asUserError(err).message);
          void qc.invalidateQueries({ queryKey: ['expense', expenseId] });
        },
      },
    );
  };

  const body = commentSchema.safeParse(draft);
  const onSend = () => {
    if (!body.success || !myId) return;
    setCommentError(null);
    setDraft('');
    addComment.mutate(
      { id: uuidV4(), expenseId: e.id, roomId, authorId: myId, body: body.data },
      {
        onError: (err) => {
          setDraft(body.data);
          setCommentError(asUserError(err).message);
        },
      },
    );
  };

  const onEdit = () =>
    router.push({
      pathname: '/rooms/[roomId]/expenses/review',
      params: { roomId, edit: e.id, version: String(e.version) },
    });

  return (
    <SafeAreaView className="flex-1 bg-app" edges={['top']}>
      <NavBar title="지출 상세" align="center" />
      {/* 댓글 입력창이 키보드와 함께 올라온다. Android는 adjustResize가 처리한다. */}
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3.5 px-5 pb-6 pt-1">
          {error && <Text className="px-1 text-13 text-danger-text">{error}</Text>}

          <View className="gap-3.5 rounded-card bg-white p-[18px]">
            <View className="flex-row items-center gap-3">
              <CategoryCircle code={toCategory(e.category)} size={40} />
              <View className="flex-1 gap-[3px]">
                <View className="flex-row items-center gap-1.5">
                  <Text className="flex-shrink font-bold text-17 text-ink">{e.merchant ?? '가맹점 없음'}</Text>
                  {e.needs_review && <Badge kind="review" />}
                </View>
                <Text className="text-13 text-ink-500">{meta}</Text>
              </View>
            </View>

            {/* 금액 규칙(노션 11번): 외화는 결제 통화 크게(강조색) + 원화 작게 회색, 원화 결제는 원화만 */}
            <View className="gap-1 rounded-box bg-app px-4 py-[18px]">
              <View className="flex-row items-center justify-between gap-2">
                <Text style={{ fontVariant: ['tabular-nums'] }} className={`font-bold text-2xl ${isKrw ? 'text-ink' : 'text-primary-text'}`}>
                  {isKrw ? formatKrw(e.krw_amount ?? amountOriginal) : formatForeign(amountOriginal, e.currency)}
                </Text>
                {!isKrw &&
                  (e.krw_amount === null ? (
                    <Badge kind="pending" />
                  ) : (
                    <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-15 text-ink-500">
                      {formatKrw(e.krw_amount)}
                    </Text>
                  ))}
              </View>
              {!isKrw && (
                <Text className="text-xs text-ink-400">
                  {fxBasisLabel({
                    source: fxSource,
                    baseDate: e.fx_base_date ?? undefined,
                    rate: e.fx_rate === null ? undefined : Number(e.fx_rate),
                    currency: e.currency,
                  })}
                </Text>
              )}
            </View>

            {(!deletable || settled) && (
              <View className={`flex-row gap-2 rounded-input px-3.5 py-3 ${deletable ? 'bg-warning-bg' : 'bg-muted'}`}>
                <Icon
                  as={deletable ? WarningCircle : InfoCircle}
                  size={18}
                  color={deletable ? colors.warning.DEFAULT : colors.ink[500]}
                />
                <Text className="flex-1 text-13 leading-5 text-ink-700">
                  {!canDelete
                    ? '올린 사람(결제자)만 삭제할 수 있어요.'
                    : spotSent
                      ? '이 자리 정산(QR)을 보낸 지출이라 삭제할 수 없어요.'
                      : '송금이 끝난 정산에 포함된 지출이에요. 삭제하면 정산 금액이 다시 계산돼요.'}
                </Text>
              </View>
            )}

            <View className="flex-row gap-2">
              <PrimaryButton title="수정" variant="muted" size="md" grow onPress={onEdit} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !deletable || del.isPending }}
                disabled={!deletable || del.isPending}
                onPress={() => setConfirmDelete(true)}
                className={`h-[52px] flex-1 flex-row items-center justify-center gap-1.5 rounded-input ${deletable ? 'bg-danger-bg' : 'bg-muted'}`}
              >
                <Icon as={Trash} size={20} color={deletable ? colors.danger.text : colors.ink[300]} />
                <Text className={`font-semibold text-base ${deletable ? 'text-danger-text' : 'text-ink-300'}`}>삭제</Text>
              </Pressable>
            </View>
          </View>

          {photoUrls && photoUrls.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {photoUrls.map((url, i) => (
                <Pressable key={url} accessibilityRole="imagebutton" accessibilityLabel={`원본 사진 ${i + 1} 크게 보기`} onPress={() => setZoomUrl(url)}>
                  <ReceiptThumb uri={url} />
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View className="gap-2.5 rounded-card bg-white p-4">
            <Text className="font-semibold text-13 text-ink-500">함께한 사람</Text>
            <View className="flex-row items-center gap-2.5">
              <AvatarStack people={scopePeople} size={28} ring="#FFFFFF" />
              <Text className="flex-1 text-sm text-ink-700">{scopePeople.map((p) => p.name).join(', ')}</Text>
            </View>
          </View>

          {e.expense_items.map((it) => {
            // 편집 중이면 화면 상태가, 아니면 저장된 지정이 정답이다.
            const assigned = new Set(pick?.[it.id] ?? it.item_assignees.map((a) => a.member_id));
            const n = assigned.size || scopePeople.length || 1;
            const per =
              it.krw_amount !== null
                ? formatKrw(floorDiv(it.krw_amount, n))
                : formatForeign(perPersonOriginal(Number(it.amount_original), n), e.currency);
            return (
              <ItemBox
                key={it.id}
                nameOriginal={it.name_original ?? ''}
                nameKo={it.name_ko ?? ''}
                quantity={Number(it.quantity)}
                amountLabel={formatForeign(Number(it.amount_original), e.currency)}
                krwLabel={it.krw_amount === null ? null : formatKrw(it.krw_amount)}
                isKrw={e.currency === 'KRW'}
                needsReview={it.needs_review}
                people={scopePeople.length > 1 ? scopePeople.map((p) => ({ ...p, on: assigned.has(p.id) })) : []}
                splitLabel={scopePeople.length > 1 ? splitLabel(n, scopePeople.length, per) : ''}
                expanded={openItems.includes(it.id)}
                onToggleOpen={() => setOpenItems((s) => (s.includes(it.id) ? s.filter((x) => x !== it.id) : [...s, it.id]))}
                onToggle={
                  scopePeople.length > 1
                    ? (memberId) =>
                        setPick((prev) => {
                          const base =
                            prev ??
                            Object.fromEntries(
                              e.expense_items.map((x) => [x.id, x.item_assignees.map((a) => a.member_id)]),
                            );
                          // 지정 없음 = 전원 켜짐이라 누르면 그 사람이 빠진다. 마지막 한 명은 끄지 않는다.
                          const next = toggleWho(base[it.id] ?? [], memberId, scopePeople.map((x) => x.id));
                          return next ? { ...base, [it.id]: next } : base;
                        })
                    : undefined
                }
              />
            );
          })}

          <View className="gap-3 rounded-card bg-white p-4">
            <Text className="font-semibold text-base text-ink">댓글</Text>
            {comments.length === 0 && <Text className="text-13 text-ink-400">궁금한 점을 댓글로 남겨보세요</Text>}
            {comments.map((c) => (
              <View key={c.id} className="gap-0.5">
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold text-xs text-ink-500">
                    {userName.get(c.authorId) ?? '탈퇴한 사용자'} · {historyStamp(c.createdAt)}
                  </Text>
                  {c.authorId === myId && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="댓글 삭제"
                      onPress={() => deleteComment.mutate({ id: c.id, expenseId: e.id })}
                      hitSlop={10}
                      className="px-1"
                    >
                      <Text className="text-xs text-ink-400">삭제</Text>
                    </Pressable>
                  )}
                </View>
                <Text className="text-base text-ink-700">{c.body}</Text>
              </View>
            ))}
          </View>

          {(history ?? []).length > 0 && (
            <View className="gap-3 rounded-card bg-white p-4">
              <Text className="font-semibold text-base text-ink">수정 이력</Text>
              {(history ?? []).map((h, i, all) => (
                <View key={h.id} className="gap-0.5">
                  <Text className="font-semibold text-xs text-ink-500">
                    {h.actorNickname ?? '탈퇴한 사용자'} · {historyStamp(h.at)}
                  </Text>
                  {diffSnapshots(i === 0 ? null : all[i - 1].snapshot, h.snapshot, names).map((line, j) => (
                    <Text key={j} className="text-sm text-ink-700">
                      {line}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View
          className="gap-2 bg-white px-5 pt-3"
          // 키보드가 올라오면 홈 인디케이터 여백이 그대로 남아 입력칸과 키보드 사이가 뜬다 — 그때만 줄인다.
          style={{ paddingBottom: keyboard > 0 ? 10 : Math.max(insets.bottom + 12, 24), boxShadow: '0 -8px 20px -12px rgba(19,25,39,.15)' }}
        >
          {/* 품목에서 사람을 고치면 그때만 저장 줄이 뜬다. 금액은 안 바뀌고 '누가 먹었는지'만 바뀐다 */}
          {pick && (
            <View className="gap-2 pb-1">
              {pickError && <Text className="text-13 text-danger-text">{pickError}</Text>}
              <View className="flex-row gap-2">
                <PrimaryButton
                  title="되돌리기"
                  variant="muted"
                  onPress={() => {
                    setPick(null);
                    setPickError(null);
                  }}
                />
                <PrimaryButton
                  title="저장하기"
                  variant="dark"
                  grow
                  loading={saveAssignees.isPending}
                  onPress={() => {
                    setPickError(null);
                    saveAssignees.mutate(pick, {
                      onSuccess: () => setPick(null),
                      onError: (err) => setPickError(asUserError(err).message),
                    });
                  }}
                />
              </View>
            </View>
          )}
          {commentError && <Text className="text-13 text-danger-text">{commentError}</Text>}
          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel="댓글 입력"
              placeholder="댓글 달기"
              placeholderTextColor={colors.ink[300]}
              value={draft}
              onChangeText={setDraft}
              maxLength={500}
              className="h-[54px] flex-1 rounded-input border border-line bg-white px-4 text-input-16 text-ink focus:border-primary"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="댓글 보내기"
              onPress={onSend}
              disabled={!body.success}
              className={`h-[54px] w-[54px] items-center justify-center rounded-input ${body.success ? 'bg-primary active:bg-primary-press' : 'bg-line'}`}
            >
              <Icon as={SendDiagonal} size={22} color={body.success ? colors.primary.on : colors.ink[300]} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="이 지출을 삭제할까요?"
        subtitle={`‘${e.merchant ?? '가맹점 없음'}’ ${e.krw_amount === null ? '' : `${formatKrw(e.krw_amount)} · `}정산 금액이 다시 계산돼요.`}
      >
        <View className="gap-3">
          {settled && (
            <View className="flex-row gap-2 rounded-input bg-warning-bg px-3.5 py-3">
              <Icon as={WarningCircle} size={18} color={colors.warning.DEFAULT} />
              <Text className="flex-1 text-13 leading-5 text-ink-700">
                송금이 끝난 정산에 포함된 지출이에요. 삭제하면 이미 주고받은 금액과 달라질 수 있어요. 동행에게 먼저 알려 주세요.
              </Text>
            </View>
          )}
          <View className="flex-row gap-2">
            <PrimaryButton title="취소" variant="muted" size="md" grow onPress={() => setConfirmDelete(false)} />
            <Pressable
              accessibilityRole="button"
              onPress={onDelete}
              className="h-[52px] flex-1 items-center justify-center rounded-input bg-danger active:opacity-90"
            >
              <Text className="font-semibold text-base text-white">삭제</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheet>

      <Modal visible={!!zoomUrl} onRequestClose={() => setZoomUrl(null)} animationType="fade">
        <SafeAreaView className="flex-1 bg-black">
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setZoomUrl(null)} className="self-end p-3">
            <Icon as={Xmark} size={26} color="#FFFFFF" />
          </Pressable>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerClassName="flex-1">
            {zoomUrl && <Image source={{ uri: zoomUrl }} resizeMode="contain" className="h-full w-full" />}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
