-- 홈 카드가 순잔액 대신 '내 지출 금액'(내 몫 합계)을 보여준다.
-- 값의 규칙은 my_expense_shares와 같다: 공동 지출 + 내가 만든 나만 보기, 원화 확정분만,
-- 박스는 실제 지정 인원으로 floor 나눔, 자투리는 결제자(공금이면 통장 주인)가 진다.
create function public._my_room_spent(p_room_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.my_share), 0)::bigint from public.my_expense_shares(p_room_id) s;
$$;
revoke execute on function public._my_room_spent(uuid) from public, anon, authenticated;

-- my_rooms에 my_spent 한 칸을 더한다. 반환 타입이 바뀌므로 drop 후 재생성한다.
drop function public.my_rooms();
create function public.my_rooms()
returns table (room_id uuid, name text, base_currency text, start_date date, end_date date,
               status text, member_count int, total_krw bigint, my_net bigint, my_spent bigint,
               has_booking boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  return query
    select r.id, r.name, r.base_currency::text, r.start_date, r.end_date,
      case
        when c.n >= 2
         and exists (select 1 from public.expenses x
                     where x.room_id = r.id and x.deleted_at is null and x.visibility = 'shared')
         and not exists (select 1 from public.room_balances(r.id, true) b where b.net <> 0 or b.fx_pending_count > 0)
          then 'settled'
        when exists (select 1 from public.transfers t where t.room_id = r.id and t.voided_at is null) then 'settling'
        when c.n >= 2 then 'shared'
        else 'solo'
      end,
      c.n,
      coalesce((select sum(x.krw_amount) from public.expenses x
                where x.room_id = r.id and x.deleted_at is null and x.fx_source <> 'pending'
                  and (x.visibility = 'shared' or x.created_by = (select auth.uid()))), 0)::bigint,
      (select b.net from public.room_balances(r.id, false) b where b.member_id = m.id),
      public._my_room_spent(r.id),
      exists (select 1 from public.trip_bookings k where k.room_id = r.id)
    from public.room_members m
    join public.rooms r on r.id = m.room_id
    cross join lateral (select count(*)::int as n from public.room_members a
                        where a.room_id = r.id and a.left_at is null) c
    where m.user_id = auth.uid() and m.kind = 'user' and m.left_at is null and r.deleted_at is null
    order by r.created_at desc;
end;
$$;
revoke execute on function public.my_rooms() from public, anon;
grant execute on function public.my_rooms() to authenticated;
