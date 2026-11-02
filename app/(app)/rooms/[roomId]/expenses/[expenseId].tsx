import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { EditPencil, SendDiagonal, Trash, Xmark } from 'iconoir-react-native';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarStack, type AvatarPerson } from '@/components/AvatarStack';
import { Badge } from '@/components/Badge';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { ItemBox } from '@/components/ItemBox';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ReceiptThumb } from '@/components/ReceiptThumb';
import { useAuth } from '@/hooks/useAuth';
import { useAddComment, useComments, useDeleteComment } from '@/hooks/useComments';
import { useDeleteExpense, useExpense, useExpenseHistory } from '@/hooks/useExpense';
import { useReconfirmPendingFx } from '@/hooks/useFeed';
import { useRoomMembers } from '@/hooks/useRooms';
import { commentSchema } from '@/lib/activity';
import { toUserError, type UserError } from '@/lib/errors';
import { perPersonOriginal } from '@/lib/expenseForm';
import { payerRecorderLabel } from '@/lib/feed';
import { diffSnapshots, historyStamp } from '@/lib/history';
import { floorDiv, formatForeign, formatKrw, fxBasisLabel } from '@/lib/money';
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
  const { data: e, error: loadError } = useExpense(expenseId);
  const { data: history } = useExpenseHistory(expenseId);
  const { data: members = [] } = useRoomMembers(roomId);
  const reconfirm = useReconfirmPendingFx(roomId);
  const del = useDeleteExpense();
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
  const [, mm, dd] = e.paid_local_date.split('-');

  const onDelete = () => {
    setConfirmDelete(false);
    setError(null);
    del.mutate(
      { roomId, id: e.id, expectedVersion: e.version },
      {
        onSuccess: () => router.back(),
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
      <NavBar
        title="지출 상세"
        align="center"
        right={
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="수정" onPress={onEdit} hitSlop={4} className="p-2">
              <Icon as={EditPencil} size={22} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="삭제"
              onPress={() => setConfirmDelete(true)}
              disabled={del.isPending}
              hitSlop={4}
              className="p-2"
            >
              <Icon as={Trash} size={22} color={colors.danger.text} />
            </Pressable>
          </>
        }
      />
      {/* 댓글 입력창이 키보드와 함께 올라온다. Android는 adjustResize가 처리한다. */}
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3.5 px-5 pb-6 pt-1">
          {error && <Text className="px-1 text-[13px] text-danger-text">{error}</Text>}

          <View className="flex-row items-center gap-3.5 rounded-card bg-white p-[18px]">
            <Pressable
              disabled={!photoUrls?.[0]}
              accessibilityRole="imagebutton"
              accessibilityLabel="원본 사진 1 크게 보기"
              onPress={() => photoUrls?.[0] && setZoomUrl(photoUrls[0])}
            >
              <ReceiptThumb uri={photoUrls?.[0]} />
            </Pressable>
            <View className="flex-1 gap-[3px]">
              <View className="flex-row items-center gap-1.5">
                <Text className="flex-shrink font-semibold text-[17px] text-ink">{e.merchant ?? '가맹점 없음'}</Text>
                {e.needs_review && <Badge kind="review" />}
              </View>
              <View className="flex-row flex-wrap items-center gap-1.5">
                <Text className="text-sm text-ink-500">
                  {Number(mm)}월 {Number(dd)}일 · {e.currency === 'KRW' ? '' : formatForeign(amountOriginal, e.currency)}
                  {e.krw_amount !== null && (
                    <>
                      {e.currency === 'KRW' ? '' : ' → '}
                      <Text style={{ fontVariant: ['tabular-nums'] }} className="font-semibold text-ink">
                        {formatKrw(e.krw_amount)}
                      </Text>
                    </>
                  )}
                </Text>
                {e.krw_amount === null && <Badge kind="pending" />}
              </View>
              <Text className="text-xs text-primary-text">
                {fxBasisLabel({
                  source: fxSource,
                  baseDate: e.fx_base_date ?? undefined,
                  rate: e.fx_rate === null ? undefined : Number(e.fx_rate),
                  currency: e.currency,
                })}
              </Text>
              <Text className="text-xs text-ink-400">
                {payerRecorderLabel(payerName, userName.get(e.created_by ?? '') ?? '탈퇴한 사용자')}
              </Text>
            </View>
          </View>

          {photoUrls && photoUrls.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {photoUrls.slice(1).map((url, i) => (
                <Pressable key={url} accessibilityRole="imagebutton" accessibilityLabel={`원본 사진 ${i + 2} 크게 보기`} onPress={() => setZoomUrl(url)}>
                  <ReceiptThumb uri={url} />
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View className="gap-2.5 rounded-card bg-white p-4">
            <Text className="font-semibold text-[13px] text-ink-500">함께한 사람</Text>
            <View className="flex-row items-center gap-2.5">
              <AvatarStack people={scopePeople} size={28} ring="#FFFFFF" />
              <Text className="flex-1 text-sm text-ink-700">{scopePeople.map((p) => p.name).join(', ')}</Text>
            </View>
          </View>

          {e.expense_items.map((it) => {
            const assigned = new Set(it.item_assignees.map((a) => a.member_id));
            const n = assigned.size;
            const per =
              it.krw_amount !== null
                ? formatKrw(floorDiv(it.krw_amount, n || 1))
                : formatForeign(perPersonOriginal(Number(it.amount_original), n || 1), e.currency);
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
                splitLabel={scopePeople.length > 1 ? (n ? `${n}명 · 1인 ${per}` : '전원 1/N') : ''}
                expanded={openItems.includes(it.id)}
                onExpand={() => setOpenItems((s) => [...s, it.id])}
                onCollapse={() => setOpenItems((s) => s.filter((x) => x !== it.id))}
              />
            );
          })}

          <View className="gap-3 rounded-card bg-white p-4">
            <Text className="font-semibold text-base text-ink">댓글</Text>
            {comments.length === 0 && <Text className="text-[13px] text-ink-400">궁금한 점을 댓글로 남겨보세요</Text>}
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
          style={{ paddingBottom: Math.max(insets.bottom + 12, 24), boxShadow: '0 -8px 20px -12px rgba(19,25,39,.15)' }}
        >
          {commentError && <Text className="text-[13px] text-danger-text">{commentError}</Text>}
          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel="댓글 입력"
              placeholder="댓글 달기"
              placeholderTextColor={colors.ink[300]}
              value={draft}
              onChangeText={setDraft}
              maxLength={500}
              className="h-[54px] flex-1 rounded-input border-[1.5px] border-line bg-white px-4 text-base text-ink focus:border-primary"
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

      <BottomSheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title="이 지출을 삭제할까요?" subtitle="삭제 기록은 수정 이력에 남아요.">
        <PrimaryButton title="삭제" variant="danger" onPress={onDelete} />
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
