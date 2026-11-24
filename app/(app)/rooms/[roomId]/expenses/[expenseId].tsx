import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ChatBubble, SendDiagonal, WarningCircle, Xmark } from 'iconoir-react-native';
import { Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useAddComment, useComments, useDeleteComment, useEditComment } from '@/hooks/useComments';
import { useDeleteExpense, useExpense } from '@/hooks/useExpense';
import { useReconfirmPendingFx } from '@/hooks/useFeed';
import { useRoomMembers } from '@/hooks/useRooms';
import { useTransfers } from '@/hooks/useSettlement';
import { useRoomSpotSettles } from '@/hooks/useSpotSettle';
import { commentSchema } from '@/lib/activity';
import { toUserError, type UserError } from '@/lib/errors';
import { historyStamp } from '@/lib/history';
import { uuidV4 } from '@/lib/uuid';
import { colors } from '@/theme/tokens';
import type { RoomMember } from '@/types/domain';

import { ExpenseEditor } from './review';

const asUserError = (err: unknown): UserError =>
  typeof err === 'object' && err !== null && 'code' in err ? (err as UserError) : toUserError(err);

// 지출 상세(노션 12번): 확인하고 나누기와 같은 영수증 티켓을 그 자리에서 고친다. 상세 전용은 댓글·삭제뿐이다.
export default function ExpenseDetailScreen() {
  const { roomId, expenseId } = useLocalSearchParams<{
    roomId: string;
    expenseId: string;
  }>();
  const qc = useQueryClient();
  const { data: e, error: loadError } = useExpense(expenseId);
  const { data: members = [] } = useRoomMembers(roomId);
  const reconfirm = useReconfirmPendingFx(roomId);
  const del = useDeleteExpense();
  const toast = useToast();
  const { data: transfers = [] } = useTransfers(roomId);
  const { data: spots = [] } = useRoomSpotSettles(roomId);
  const myId = useAuth().session?.user.id;
  const { data: comments = [] } = useComments(expenseId);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <NavBar />
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-base text-ink-500">지출을 찾을 수 없어요</Text>
        </View>
      </SafeAreaView>
    ) : null;
  }

  // 삭제 규칙(노션 12번). 올린 사람이나 결제자 본인만 지울 수 있다.
  const payerUserId = members.find((m) => m.id === e.payer_member_id)?.userId;
  const canDelete = !!myId && (e.created_by === myId || (e.payer_kind !== 'pool' && payerUserId === myId));
  const spotSent = spots.some((s) => s.sentAt && s.expenses.some((x) => x.id === e.id && x.selected));
  // ponytail: 송금은 지출과 직접 묶여 있지 않다. 이 지출이 올라온 뒤 완료된 송금이 있으면 '정산에 포함'으로 본다.
  const settled = transfers.some((t) => t.confirmedAt && !t.voidedAt && t.createdAt >= e.created_at);
  const deletable = canDelete && !spotSent;

  const onDeletePress = () => {
    if (spotSent) return toast('이 자리 정산(QR)을 보낸 지출이라 삭제할 수 없어요');
    setConfirmDelete(true);
  };

  const onDelete = () => {
    setConfirmDelete(false);
    del.mutate(
      { roomId, id: e.id, expectedVersion: e.version },
      {
        onSuccess: () => {
          toast('지출을 삭제했어요');
          router.back();
        },
        onError: (err) => {
          toast(asUserError(err).message);
          void qc.invalidateQueries({ queryKey: ['expense', expenseId] });
        },
      },
    );
  };

  return (
    <ExpenseEditor
      roomId={roomId}
      edit={e.id}
      version={e.version}
      linkedScheduleId={e.schedule_id}
      navRight={
        // 댓글(노션 38): 말풍선 + 개수 배지 → 바텀시트
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`댓글 ${comments.length}개`}
          onPress={() => setCommentsOpen(true)}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
        >
          <Icon as={ChatBubble} size={24} color={colors.ink.DEFAULT} />
          {comments.length > 0 && (
            <View
              style={{ borderColor: colors.canvas }}
              className="absolute right-0.5 top-0.5 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 bg-primary-text px-1"
            >
              <Text className="font-semibold text-11 leading-[13px] text-white">{comments.length}</Text>
            </View>
          )}
        </Pressable>
      }
      deleteButton={
        // 올린 사람(결제자)이 아니면 버튼 자체를 숨긴다. QR 정산을 보낸 지출은 회색 글자 + 토스트로 이유를 알린다.
        canDelete && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="삭제"
            disabled={del.isPending}
            onPress={onDeletePress}
            className={`h-14 w-24 items-center justify-center rounded-button ${deletable ? 'bg-danger-bg' : 'bg-muted'} active:opacity-80`}
          >
            {/* 연한 배경 위 빨강은 흰 글씨보다 굵어 보여, [수정하기](SemiBold)와 맞춰 보이게 Medium으로 둔다. */}
            <Text className={`font-medium text-17 ${deletable ? 'text-danger' : 'text-ink-300'}`}>삭제</Text>
          </Pressable>
        )
      }
    >
      {/* 삭제 확인: 가운데 다이얼로그(radius 20) */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View className="flex-1 items-center justify-center bg-[rgba(23,32,58,0.45)] px-8">
          <View className="w-full gap-4 rounded-sheet bg-white p-5">
            <View className="gap-1">
              <Text className="font-semibold text-lg text-ink">이 지출을 삭제할까요?</Text>
              <Text className="text-sm text-ink-500">정산 금액이 다시 계산돼요.</Text>
            </View>
            {settled && (
              <View className="flex-row gap-2 rounded-input bg-warning-bg px-3.5 py-3">
                <Icon as={WarningCircle} size={18} color={colors.warning.DEFAULT} />
                <Text className="flex-1 text-13 leading-5 text-ink-700">
                  송금이 끝난 정산에 포함된 지출이에요. 삭제하면 정산 금액이 다시 계산돼요.
                </Text>
              </View>
            )}
            <View className="flex-row gap-2">
              <PrimaryButton title="취소" variant="muted" size="md" grow onPress={() => setConfirmDelete(false)} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="삭제 확인"
                onPress={onDelete}
                className="h-[52px] flex-1 items-center justify-center rounded-input bg-danger active:opacity-90"
              >
                <Text className="font-semibold text-base text-white">삭제</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CommentsSheet visible={commentsOpen} onClose={() => setCommentsOpen(false)} roomId={roomId} expenseId={e.id} members={members} />
    </ExpenseEditor>
  );
}

// 댓글 바텀시트(노션 38): 최대 화면 72%, 목록은 스크롤, 입력 줄은 아래 고정. 내 댓글은 고치고 지울 수 있다.
function CommentsSheet({
  visible,
  onClose,
  roomId,
  expenseId,
  members,
}: {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  expenseId: string;
  members: RoomMember[];
}) {
  const toast = useToast();
  const myId = useAuth().session?.user.id;
  const { height: screenH } = useWindowDimensions();
  const { data: comments = [] } = useComments(expenseId);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const editComment = useEditComment();
  const [editingId, setEditingId] = useState<string | null>(null); // 고치는 중인 내 댓글
  const [draft, setDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const author = new Map(members.flatMap((m, i) => (m.userId ? [[m.userId, { name: m.name, colorIndex: i }] as const] : [])));

  const body = commentSchema.safeParse(draft);
  const onSend = () => {
    if (!body.success || !myId) return;
    setCommentError(null);
    setDraft('');
    if (editingId) {
      const id = editingId;
      setEditingId(null);
      editComment.mutate(
        { id, expenseId, body: body.data },
        {
          onError: (err) => {
            setEditingId(id);
            setDraft(body.data);
            setCommentError(asUserError(err).message);
          },
        },
      );
      return;
    }
    addComment.mutate(
      {
        id: uuidV4(),
        expenseId,
        roomId,
        authorId: myId,
        body: body.data,
      },
      {
        onError: (err) => {
          setDraft(body.data);
          setCommentError(asUserError(err).message);
        },
      },
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ maxHeight: screenH * 0.72 }}>
        <View className="flex-row items-center justify-between pb-2">
          <Text className="font-semibold text-lg text-ink">
            댓글 <Text className="text-primary-text">{comments.length}</Text>
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="댓글 닫기" onPress={onClose} hitSlop={10}>
            <Icon as={Xmark} size={24} color={colors.ink[500]} />
          </Pressable>
        </View>
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          {comments.length === 0 && (
            <Text className="py-10 text-center text-sm text-ink-300">
              아직 댓글이 없어요{'\n'}궁금한 품목이 있으면 남겨 보세요
            </Text>
          )}
          {comments.map((c, i) => {
            const a = author.get(c.authorId);
            return (
              <View key={c.id} className={`flex-row gap-3 py-3.5 ${i > 0 ? 'border-t border-line-row' : ''}`}>
                <Avatar name={a?.name ?? '?'} colorIndex={a?.colorIndex ?? 0} size={32} />
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="font-semibold text-13 text-ink">{a?.name ?? '탈퇴한 사용자'}</Text>
                    <Text className="flex-1 text-xs text-ink-300">{historyStamp(c.createdAt)}</Text>
                    {c.authorId === myId && (
                      <View className="flex-row gap-3">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="댓글 수정"
                          onPress={() => {
                            setEditingId(c.id);
                            setDraft(c.body);
                            setCommentError(null);
                          }}
                          hitSlop={10}
                        >
                          <Text className="text-xs text-ink-300">수정</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="댓글 삭제"
                          onPress={() => {
                            if (editingId === c.id) {
                              setEditingId(null);
                              setDraft('');
                            }
                            deleteComment.mutate({ id: c.id, expenseId }, { onSuccess: () => toast('댓글을 삭제했어요') });
                          }}
                          hitSlop={10}
                        >
                          <Text className="text-xs text-ink-300">삭제</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  <Text className="text-15 leading-[22px] text-ink">{c.body}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
        <View className="gap-2 border-t border-line-row pt-3">
          {editingId && (
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold text-xs text-primary-text">댓글 수정 중</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="댓글 수정 취소"
                onPress={() => {
                  setEditingId(null);
                  setDraft('');
                }}
                hitSlop={10}
              >
                <Text className="text-xs text-ink-500">취소</Text>
              </Pressable>
            </View>
          )}
          {commentError && <Text className="text-13 text-danger-text">{commentError}</Text>}
          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel="댓글 입력"
              placeholder="댓글을 입력해 주세요"
              placeholderTextColor={colors.ink[300]}
              value={draft}
              onChangeText={setDraft}
              maxLength={500}
              className="h-11 flex-1 rounded-full bg-app px-4 text-input-15 text-ink"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="댓글 보내기"
              onPress={onSend}
              disabled={!body.success}
              className={`h-11 w-11 items-center justify-center rounded-full ${body.success ? 'bg-primary active:bg-primary-press' : 'bg-muted'}`}
            >
              <Icon as={SendDiagonal} size={20} color={body.success ? colors.primary.on : colors.ink[300]} />
            </Pressable>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
