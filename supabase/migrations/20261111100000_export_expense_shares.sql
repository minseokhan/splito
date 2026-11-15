-- 지출 내역 내보내기(Excel·PDF)용: 지출 × 참여자 몫(원). export-expenses Edge Function이 사용자 JWT로 부른다.
-- 배분 규칙은 room_balances(20261102165251)의 e/box/eff/share CTE와 같다 — 파일의 몫 합계가 정산 화면과 어긋나면 안 된다.
-- 다른 점은 범위뿐이다: 공동 지출 + 호출자의 나만 보기 지출(RLS expenses_select와 같은 기준). 환율 대기는 원화가 없어 뺀다.
create function public.export_expense_shares(p_room_id uuid)
returns table (expense_id uuid, member_id uuid, share bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  return query
    with r as (
      select * from public.rooms where id = p_room_id
    ), e as (  -- 자투리 부담자 = 결제자, 공금이면 통장 주인
      select x.id, coalesce(x.payer_member_id, r.pool_owner_member_id) as burden_member_id
      from public.expenses x cross join r
      where x.room_id = p_room_id and x.deleted_at is null and x.fx_source <> 'pending'
        and (x.visibility = 'shared' or x.created_by = auth.uid())
    ), box as (
      select i.id, i.expense_id, i.krw_amount, e.burden_member_id
      from public.expense_items i join e on e.id = i.expense_id
    ), eff as (  -- 실제 지정 인원 = 지정 ∩ 대상 인원. 비면 대상 인원 전체
      select b.id as item_id, s.member_id
      from box b join public.expense_scope s on s.expense_id = b.expense_id
      where exists (select 1 from public.item_assignees a where a.item_id = b.id and a.member_id = s.member_id)
         or not exists (select 1 from public.item_assignees a join public.expense_scope s2
                          on s2.expense_id = b.expense_id and s2.member_id = a.member_id
                        where a.item_id = b.id)
    ), sh as (
      select b.id, b.expense_id, b.krw_amount, b.burden_member_id, c.n,
             floor(b.krw_amount::numeric / c.n)::bigint as q
      from box b join (select item_id, count(*) as n from eff group by item_id) c on c.item_id = b.id
    ), ledger (eid, mid, amt) as (
      select s.expense_id, f.member_id, s.q from eff f join sh s on s.id = f.item_id
      union all select expense_id, burden_member_id, krw_amount - q * n from sh
    )
    select eid, mid, sum(amt)::bigint from ledger where mid is not null group by eid, mid having sum(amt) <> 0;
end;
$$;

revoke execute on function public.export_expense_shares(uuid) from public, anon;
grant execute on function public.export_expense_shares(uuid) to authenticated;
