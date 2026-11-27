-- 노션 35번: QR 웹 화면을 영수증 티켓으로 바꾼다. 티켓은 참여 전·송금·완료 세 단계 공통이라
-- 지금 응답에 없는 것만 더한다 — 카테고리, 결제 시각, 품목 전체(receipt), 참여 전 내 몫 미리보기.
--
-- 기존 키(items·my_share 등)의 의미는 바꾸지 않는다(170 테스트·앱이 그대로 기대한다).
-- 본문 100줄을 다시 쓰지 않으려고 기존 함수를 바탕 함수로 이름만 바꾸고, 새 spot_public_view가
-- 그 결과에 키를 붙인다.
--
-- 노출 범위: 품목은 이미 보이던 가게·전체 금액의 내역일 뿐이다. 누가 먹었는지(사람)는 주지 않고
-- 나누는 인원 수만 준다. 계좌 등 나머지는 바탕 함수의 판정 그대로다.

alter function public.spot_public_view(text, uuid) rename to _spot_public_view_base;
revoke execute on function public._spot_public_view_base(text, uuid) from public, anon, authenticated, service_role;

create function public.spot_public_view(p_token text, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_base jsonb := public._spot_public_view_base(p_token, p_member_id);
  v_spot uuid;
  v_joined boolean := coalesce((v_base ->> 'joined')::boolean, false);
  v_first public.expenses;
begin
  if v_base ? 'error' then return v_base; end if;
  select id into v_spot from public.spot_settles where token = p_token;

  select e.* into v_first from public.expenses e
  join public.spot_expenses x on x.expense_id = e.id and x.spot_id = v_spot
  where e.deleted_at is null order by e.created_at limit 1;

  return v_base || jsonb_build_object(
    'category', v_first.category,
    'paid_local_time', to_char(v_first.paid_local_time, 'HH24:MI'),
    -- 품목마다 나누는 인원 = 지정 ∩ 참여자, 비면 참여자 전원(_spot_share와 같은 규칙).
    -- 참여 전이면 나를 더한다 — 참여하는 순간 모든 품목에 들어가기 때문이다(spot_join).
    'receipt', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(nullif(btrim(coalesce(i.name_ko, '')), ''), i.name_original),
               'name_original', case when nullif(btrim(coalesce(i.name_ko, '')), '') is not null
                                       and i.name_ko <> i.name_original then i.name_original end,
               'currency', e.currency,
               'amount_original', i.amount_original,
               'krw', i.krw_amount,
               'n', (select count(*) from public.spot_participants p
                     where p.spot_id = v_spot
                       and (exists (select 1 from public.item_assignees a
                                    where a.item_id = i.id and a.member_id = p.member_id)
                         or not exists (select 1 from public.item_assignees a
                                        join public.spot_participants p2
                                          on p2.spot_id = v_spot and p2.member_id = a.member_id
                                        where a.item_id = i.id)))::int
                    + case when v_joined then 0 else 1 end)
             order by e.created_at, i.position)
      from public.expense_items i
      join public.expenses e on e.id = i.expense_id and e.deleted_at is null
      join public.spot_expenses x on x.expense_id = e.id and x.spot_id = v_spot), '[]'),
    'share_preview', case when v_joined then null else public._spot_share(v_spot) end);
end;
$$;
revoke execute on function public.spot_public_view(text, uuid) from public, anon, authenticated;
grant execute on function public.spot_public_view(text, uuid) to service_role;
