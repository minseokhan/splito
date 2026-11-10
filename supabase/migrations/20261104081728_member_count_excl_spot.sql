-- my_rooms.member_count에서 QR 참여자(spot_only)를 뺀다.
--
-- 증상: QR로 한 명 들어오자마자 패키지 여행이 홈의 '마무리된 여행'으로 내려갔다.
-- 경로: member_count가 1 → 2가 되면서 status 판정의 'c.n >= 2' 관문을 통과했고,
--       그 방에는 공동 지출이 1건 있고 아직 [정산 요청 보내기] 전이라 아무도 주고받을 돈이
--       없었다 → 'settled'. 홈은 settled를 '마무리된 여행'으로 내린다.
--       여행 시작일이 아직 일주일 뒤인데도 그렇게 됐다.
--
-- member_count는 '이 여행의 동행이 몇인가'를 뜻한다. QR 참여자는 한 자리에만 있던 사람이지
-- 동행이 아니므로 세면 안 된다 — 참여자 팝오버도 같은 기준으로 센다.
--
-- 받을 돈이 가려질 걱정은 없다: QR 참여자가 실제로 빚을 지면(정산 요청을 보낸 뒤)
-- 결제자의 my_net이 0이 아니게 되어 isActiveTrip이 그 여행을 계속 위에 둔다.
-- 'settled' 판정도 net <> 0 을 따로 보므로 그대로 막힌다.

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
    -- 동행 수만 센다. QR로 한 자리에만 들어온 사람은 동행이 아니다.
    cross join lateral (select count(*)::int as n from public.room_members a
                        where a.room_id = r.id and a.left_at is null and not a.spot_only) c
    where m.user_id = auth.uid() and m.kind = 'user' and m.left_at is null and r.deleted_at is null
    order by r.created_at desc;
end;
$$;
revoke execute on function public.my_rooms() from public, anon;
grant execute on function public.my_rooms() to authenticated;
