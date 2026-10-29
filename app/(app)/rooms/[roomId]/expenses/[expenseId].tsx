import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarStack, type AvatarPerson } from '@/components/AvatarStack';
import { Badge } from '@/components/Badge';
import { BottomSheet } from '@/components/BottomSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useDeleteExpense, useExpense, useExpenseHistory } from '@/hooks/useExpense';
import { useReconfirmPendingFx } from '@/hooks/useFeed';
import { useRoomMembers } from '@/hooks/useRooms';
import { toUserError, type UserError } from '@/lib/errors';
import { dateTitle, payerRecorderLabel } from '@/lib/feed';
import { diffSnapshots, historyStamp } from '@/lib/history';
import { formatForeign, formatKrw, fxBasisLabel } from '@/lib/money';
import { signedUrl } from '@/services/storage';
import type { FxSource } from '@/types/domain';

// 서명 URL은 10분짜리라 9분 지나면 다시 받는다(ARCHITECTURE §4).
const SIGNED_URL_STALE_MS = 9 * 60_000;

const asUserError = (err: unknown): UserError =>
  typeof err === 'object' && err !== null && 'code' in err ? (err as UserError) : toUserError(err);

export default function ExpenseDetailScreen() {
  const { roomId, expenseId } = useLocalSearchParams<{ roomId: string; expenseId: string }>();
  const qc = useQueryClient();
  const { data: e, error: loadError } = useExpense(expenseId);
  const { data: history } = useExpenseHistory(expenseId);
  const { data: members = [] } = useRoomMembers(roomId);
  const reconfirm = useReconfirmPendingFx(roomId);
  const del = useDeleteExpense();
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-5">
        <Text className="text-[15px] text-ink-700">지출을 찾을 수 없어요</Text>
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

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      <ScrollView contentContainerClassName="gap-6 px-5 pb-6 pt-4">
        <View className="gap-1">
          {e.needs_review && <Badge kind="review" />}
          <Text className="font-bold text-[22px] text-ink-900">{e.merchant ?? '가맹점 없음'}</Text>
          <Text className="text-[13px] text-ink-500">
            {dateTitle(e.paid_local_date)} · {payerRecorderLabel(payerName, userName.get(e.created_by ?? '') ?? '탈퇴한 사용자')}
          </Text>
        </View>

        <View className="rounded-lg bg-sky-200 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-[15px] text-ink-700">{formatForeign(Number(e.amount_original), e.currency)}</Text>
            {e.krw_amount === null ? (
              <Badge kind="pending" />
            ) : (
              <Text style={{ fontVariant: ['tabular-nums'] }} className="font-bold text-[17px] text-ink-900">
                {formatKrw(e.krw_amount)}
              </Text>
            )}
          </View>
          <Text className="mt-1 text-[13px] text-ink-500">
            {fxBasisLabel({
              source: fxSource,
              baseDate: e.fx_base_date ?? undefined,
              rate: e.fx_rate === null ? undefined : Number(e.fx_rate),
              currency: e.currency,
            })}
          </Text>
        </View>

        {photoUrls && photoUrls.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {photoUrls.map((url, i) => (
              <Pressable key={url} accessibilityRole="imagebutton" accessibilityLabel={`원본 사진 ${i + 1} 크게 보기`} onPress={() => setZoomUrl(url)}>
                <Image source={{ uri: url }} className="h-24 w-24 rounded-lg border border-line" />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View className="gap-2">
          <Text className="font-semibold text-[17px] text-ink-900">대상 인원</Text>
          <AvatarStack people={scopePeople} />
          <Text className="text-[13px] text-ink-500">{scopePeople.map((p) => p.name).join(', ')}</Text>
        </View>

        <View className="gap-2">
          {e.expense_items.map((it) => {
            const assignees = it.item_assignees.flatMap((a) => people.get(a.member_id) ?? []);
            return (
              <View key={it.id} className={`rounded-md border bg-white p-3 ${it.needs_review ? 'border-[#F0C14B]' : 'border-line'}`}>
                {!!it.name_original && <Text className="text-sm text-ink-500">{it.name_original}</Text>}
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 font-semibold text-base text-ink-900">{it.name_ko || it.name_original || '품목'}</Text>
                  {assignees.length ? (
                    <AvatarStack people={assignees} />
                  ) : (
                    <Text className="rounded-md bg-sky-100 px-2 py-1 text-[13px] text-sky-900">전원</Text>
                  )}
                </View>
                <View className="mt-1 flex-row justify-between">
                  <Text className="text-[13px] text-ink-500">
                    {Number(it.quantity)} × {formatForeign(Number(it.amount_original), e.currency)}
                  </Text>
                  {it.krw_amount !== null && (
                    <Text style={{ fontVariant: ['tabular-nums'] }} className="text-[13px] text-ink-700">
                      {formatKrw(it.krw_amount)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* 댓글은 7-activity에서 이 자리에 붙인다. */}

        <View className="gap-3">
          <Text className="font-semibold text-[17px] text-ink-900">수정 이력</Text>
          {(history ?? []).map((h, i, all) => (
            <View key={h.id} className="gap-1">
              <Text className="text-[13px] text-ink-500">
                {h.actorNickname ?? '탈퇴한 사용자'} · {historyStamp(h.at)}
              </Text>
              {diffSnapshots(i === 0 ? null : all[i - 1].snapshot, h.snapshot, names).map((line, j) => (
                <Text key={j} className="text-[15px] text-ink-700">
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="gap-2 border-t border-divider px-5 pt-3">
        {error && <Text className="text-sm text-minus">{error}</Text>}
        <PrimaryButton
          title="수정"
          onPress={() =>
            router.push({
              pathname: '/rooms/[roomId]/expenses/review',
              params: { roomId, edit: e.id, version: String(e.version) },
            })
          }
        />
        <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} disabled={del.isPending} className="h-11 items-center justify-center">
          <Text className="font-medium text-[15px] text-minus">삭제</Text>
        </Pressable>
      </View>

      <BottomSheet visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <Text className="font-semibold text-[17px] text-ink-900">이 지출을 삭제할까요?</Text>
        <Text className="mt-1 text-[15px] text-ink-700">삭제 기록은 수정 이력에 남아요.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onDelete}
          className="mt-4 h-14 items-center justify-center rounded-xl border border-[#F2C4C4] bg-white"
        >
          <Text className="font-semibold text-base text-minus">삭제</Text>
        </Pressable>
      </BottomSheet>

      <Modal visible={!!zoomUrl} onRequestClose={() => setZoomUrl(null)} animationType="fade">
        <SafeAreaView className="flex-1 bg-black">
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setZoomUrl(null)} className="h-11 justify-center self-end px-5">
            <Text className="font-medium text-[15px] text-white">닫기</Text>
          </Pressable>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerClassName="flex-1">
            {zoomUrl && <Image source={{ uri: zoomUrl }} resizeMode="contain" className="h-full w-full" />}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
