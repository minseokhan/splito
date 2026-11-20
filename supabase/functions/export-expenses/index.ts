// 지출 내역 내보내기: GET ?room_id=…&format=xlsx|pdf → 파일 바이트. 파일명은 X-Filename(URL 인코딩) 헤더로 준다.
// 사용자 JWT 클라이언트로 읽는다 — 방 참여 여부와 남의 나만 보기 지출은 RLS·RPC가 거른다.
import { requireUser } from '../_shared/auth.ts';
import { errorResponse } from '../_shared/http.ts';
import { renderPdf } from './pdf.ts';
import { buildReport, type ReportInput } from './report.ts';
import { renderXlsx } from './xlsx.ts';

const asset = (name: string) => Deno.readFile(new URL(`./assets/${name}`, import.meta.url));
const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const;

Deno.serve(async (req) => {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;
  const url = new URL(req.url);
  const roomId = url.searchParams.get('room_id') ?? '';
  const format = url.searchParams.get('format');
  if (!/^[0-9a-f-]{36}$/.test(roomId) || (format !== 'xlsx' && format !== 'pdf')) return errorResponse('INVALID_INPUT', 400);

  const q = <T>(p: PromiseLike<{ data: T | null; error: unknown }>) =>
    p.then(({ data, error }) => {
      if (error) throw error;
      return data as T;
    });
  try {
    const [room, members, expenses, scope, items, assignees, shares, schedules, spots] = await Promise.all([
      q(client.from('rooms').select('name, base_currency, start_date, end_date, owner_id').eq('id', roomId).maybeSingle()),
      q(client.from('room_members').select('id, kind, user_id, guest_name, left_at, spot_only').eq('room_id', roomId).order('joined_at').order('id')),
      q(client.from('expenses').select(
        'id, payer_kind, payer_member_id, source, flags, merchant, paid_local_date, paid_local_time, currency, amount_original, krw_amount, fx_rate, fx_source, visibility, category, schedule_id, created_by, created_at',
      ).eq('room_id', roomId).is('deleted_at', null)),
      q(client.from('expense_scope').select('expense_id, member_id').eq('room_id', roomId)),
      q(client.from('expense_items').select('id, expense_id').eq('room_id', roomId)),
      q(client.from('item_assignees').select('item_id').eq('room_id', roomId)),
      q(client.rpc('export_expense_shares', { p_room_id: roomId })),
      q(client.from('schedule_items').select('id, day_index, start_time, title').eq('room_id', roomId)),
      q(client.rpc('room_spot_settles', { p_room_id: roomId })),
    ]);
    // deno-lint-ignore no-explicit-any
    const ms = members as any[];
    const me = ms.find((m) => m.user_id === user.id && !m.left_at);
    if (!room || !me) return errorResponse('FORBIDDEN', 403, roomId);
    // deno-lint-ignore no-explicit-any
    const exps = expenses as any[];
    if (!exps.length) return errorResponse('NO_EXPENSE', 400, roomId);

    const ids = [...new Set(ms.flatMap((m) => (m.user_id ? [m.user_id] : [])))];
    const profiles = ids.length ? await q(client.from('member_profiles').select('id, nickname').in('id', ids)) : [];
    // deno-lint-ignore no-explicit-any
    const nick = new Map((profiles as any[]).map((p) => [p.id, p.nickname]));
    // deno-lint-ignore no-explicit-any
    const itemExpense = new Map((items as any[]).map((i) => [i.id, i.expense_id]));
    // deno-lint-ignore no-explicit-any
    const itemized = new Set((assignees as any[]).map((a) => itemExpense.get(a.item_id)));

    const input: ReportInput = {
      now: new Date(),
      me: { userId: user.id, memberId: me.id },
      // deno-lint-ignore no-explicit-any
      room: room as any,
      members: ms.map((m) => ({
        id: m.id,
        kind: m.kind,
        userId: m.user_id,
        name: m.guest_name ?? nick.get(m.user_id) ?? '탈퇴한 사용자',
        leftAt: m.left_at,
        spotOnly: m.spot_only,
      })),
      expenses: exps.map((e) => ({ ...e, amount_original: Number(e.amount_original), itemized: itemized.has(e.id) })),
      // deno-lint-ignore no-explicit-any
      scope: scope as any[],
      // deno-lint-ignore no-explicit-any
      shares: (shares as any[]).map((s) => ({ ...s, share: Number(s.share) })),
      // deno-lint-ignore no-explicit-any
      schedules: schedules as any[],
      // 이 자리 정산을 보낸(sent_at) 건의 고른 지출
      // deno-lint-ignore no-explicit-any
      spotDone: (spots as any[]).filter((s) => s.sent_at).flatMap((s) =>
        s.expenses.filter((x: { selected: boolean }) => x.selected).map((x: { id: string }) => x.id)
      ),
    };

    const report = buildReport(input);
    const body = format === 'xlsx'
      ? await renderXlsx(report)
      : await renderPdf(report, {
        regular: await asset('Pretendard-Regular-KSX.ttf'),
        semibold: await asset('Pretendard-SemiBold-KSX.ttf'),
        logo: await asset('splito-lockup-light.png'),
      });
    return new Response(body as BodyInit, {
      headers: { 'Content-Type': MIME[format], 'X-Filename': encodeURIComponent(report.filename(format)) },
    });
  } catch (e) {
    // 차액 합 ≠ 0이면 파일을 만들지 않는다(명세 §4). 원인 추적용으로 코드만 남긴다.
    const invariant = e instanceof Error && e.message.startsWith('EXPORT_INVARIANT');
    if (invariant) console.error(JSON.stringify({ code: 'EXPORT_INVARIANT', room_id: roomId, detail: e.message }));
    return errorResponse(invariant ? 'EXPORT_INVARIANT' : 'EXPORT_FAILED', 500, roomId);
  }
});
