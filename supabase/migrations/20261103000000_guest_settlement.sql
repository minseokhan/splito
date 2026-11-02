-- 게스트 분리 정산 (PRD §7.2 개정, ADR-011 개정)
-- 바뀐 점: 게스트 순잔액을 대표자에게 합산하지 않고 각자 계산한다 — 게스트도 일반 참여자처럼 따로 정산한다.
-- 게스트는 앱이 없어 직접 누를 수 없으므로, 대표자가 게스트 대신 송금을 기록·확인·취소한다.
-- 대표자는 이제 '정산을 합산받는 사람'이 아니라 '게스트를 대신해 누르고 알려주는 사람'이다.

-- 호출자가 그 참여자로서 행동할 수 있는가: 본인이거나, 그 게스트의 대표자.
create function public._acts_for(p_room_id uuid, p_member_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m
    where m.id = p_member_id and m.room_id = p_room_id
      and (m.id = public.my_member_id(p_room_id)
        or (m.kind = 'guest' and m.representative_member_id = public.my_member_id(p_room_id)))
  );
$$;

-- room_balances: 게스트 net을 대표자에 합산하던 case를 걷어낸다. 나머지는 20261101010000 정의 그대로.
create or replace function public.room_balances(p_room_id uuid, p_confirmed_only boolean default false)
returns table (member_id uuid, kind text, representative_member_id uuid, joined_at timestamptz,
               left_at timestamptz, paid bigint, owed bigint, net bigint, fx_pending_count int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_sum bigint := 0;
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  for member_id, kind, representative_member_id, joined_at, left_at, paid, owed, net, fx_pending_count in
    with r as (
      select * from public.rooms where id = p_room_id
    ), e as (  -- 원화 확정된 활성 공동 지출. 자투리 부담자 = 결제자, 공금이면 통장 주인
      select x.id, x.payer_kind, x.payer_member_id, x.krw_amount,
             coalesce(x.payer_member_id, r.pool_owner_member_id) as burden_member_id
      from public.expenses x cross join r
      where x.room_id = p_room_id and x.deleted_at is null and x.fx_source <> 'pending'
        and x.visibility = 'shared'
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
    ), share as (
      select b.id, b.krw_amount, b.burden_member_id, c.n,
             floor(b.krw_amount::numeric / c.n)::bigint as q  -- bigint `/`는 0 쪽 버림이라 floor 명시
      from box b join (select item_id, count(*) as n from eff group by item_id) c on c.item_id = b.id
    ), t as (
      select from_member_id, to_member_id, amount_krw from public.transfers
      where room_id = p_room_id and voided_at is null and (not p_confirmed_only or confirmed_at is not null)
    ), ledger (mid, paid, owed) as (
      select payer_member_id, krw_amount, 0::bigint from e where payer_kind = 'member'
      union all select f.member_id, 0, s.q from eff f join share s on s.id = f.item_id
      union all select burden_member_id, 0, krw_amount - q * n from share
      union all select d.member_id, d.amount_krw, 0 from public.pool_deposits d where d.room_id = p_room_id
      union all select from_member_id, amount_krw, 0 from t
      union all select to_member_id, 0, amount_krw from t
      -- 남은 공금(입금 − 공금 결제)은 통장 주인이 돌려줄 돈. 부족하면 음수 = 받을 돈
      union all select r.pool_owner_member_id, 0,
        coalesce((select sum(d.amount_krw) from public.pool_deposits d where d.room_id = p_room_id), 0)
        - coalesce((select sum(krw_amount) from e where payer_kind = 'pool'), 0)
      from r where r.pool_owner_member_id is not null
    ), agg as (
      select mid, sum(paid)::bigint as paid, sum(owed)::bigint as owed from ledger group by mid
    ), own as (
      select m.id, m.kind, m.representative_member_id, m.joined_at, m.left_at,
             coalesce(a.paid, 0) as paid, coalesce(a.owed, 0) as owed
      from public.room_members m left join agg a on a.mid = m.id
      where m.room_id = p_room_id
    )
    -- 게스트도 자기 net을 갖는다. Σ net = 0은 그대로 성립한다.
    select o.id, o.kind, o.representative_member_id, o.joined_at, o.left_at, o.paid, o.owed,
           (o.paid - o.owed)::bigint,
           -- 나만 보기 지출의 환율 미확정이 남의 정산을 막으면 안 된다
           (select count(*)::int from public.expenses x
            where x.room_id = p_room_id and x.deleted_at is null and x.fx_source = 'pending'
              and x.visibility = 'shared')
    from own o
    order by o.joined_at, o.id
  loop
    v_sum := v_sum + net;
    return next;
  end loop;

  if v_sum <> 0 then
    raise exception 'room_balances invariant violated for room %: sum(net) = %', p_room_id, v_sum;
  end if;
end;
$$;

-- record_transfer: 게스트도 송금 당사자가 된다. 당사자이거나 그 게스트의 대표자면 기록할 수 있다.
create or replace function public.record_transfer(p_id uuid, p_room_id uuid, p_from_member_id uuid, p_to_member_id uuid, p_amount_krw bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  perform 1 from public.rooms where id = p_room_id and deleted_at is null for update;
  if public.my_member_id(p_room_id) is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  if exists (select 1 from public.transfers where id = p_id) then return; end if;  -- 재전송 멱등

  if p_from_member_id is not distinct from p_to_member_id then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if coalesce(p_amount_krw, 0) <= 0 then raise exception using errcode = 'P0001', message = 'AMOUNT_INVALID'; end if;
  -- 당사자는 이 방의 참여자(게스트 포함)
  select count(*) into v_n from public.room_members
  where room_id = p_room_id and id in (p_from_member_id, p_to_member_id);
  if v_n <> 2 then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if exists (select 1 from public.room_members where id in (p_from_member_id, p_to_member_id) and left_at is not null) then
    raise exception using errcode = 'P0001', message = 'MEMBER_LEFT';
  end if;
  -- 내가 당사자이거나, 당사자인 게스트의 대표자여야 한다
  if not (public._acts_for(p_room_id, p_from_member_id) or public._acts_for(p_room_id, p_to_member_id)) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  -- 받는 쪽에서 기록하면(게스트면 그 대표자가) 바로 확인
  insert into public.transfers (id, room_id, from_member_id, to_member_id, amount_krw, recorded_by, confirmed_at)
  values (p_id, p_room_id, p_from_member_id, p_to_member_id, p_amount_krw, auth.uid(),
          case when public._acts_for(p_room_id, p_to_member_id) then now() end);
  insert into public.room_events (room_id, kind, actor_id, payload)
  values (p_room_id, 'transfer', auth.uid(), jsonb_build_object('transfer_id', p_id, 'from_member_id', p_from_member_id,
          'to_member_id', p_to_member_id, 'amount_krw', p_amount_krw));
end;
$$;

-- _lock_transfer: 확인·거절·취소도 게스트 대표자가 대신 누를 수 있다.
create or replace function public._lock_transfer(p_id uuid, p_side text) returns public.transfers
language plpgsql set search_path = '' as $$
declare
  v_t public.transfers;
  v_party uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_t from public.transfers where id = p_id;
  perform 1 from public.rooms where id = v_t.room_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_t from public.transfers where id = p_id;  -- 잠금 후 다시 읽는다
  v_party := v_t.to_member_id;
  if p_side = 'from' then v_party := v_t.from_member_id; end if;
  if v_t.voided_at is not null or not public._acts_for(v_t.room_id, v_party) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  return v_t;
end;
$$;

-- remove_guest: 송금 당사자로 쓰인 게스트도 지울 수 없다(장부와 같은 이유).
create or replace function public.remove_guest(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_g public.room_members := public._lock_guest(p_member_id);
begin
  if exists (select 1 from public.expenses where payer_member_id = v_g.id)
     or exists (select 1 from public.expense_scope where member_id = v_g.id)
     or exists (select 1 from public.item_assignees where member_id = v_g.id)
     or exists (select 1 from public.pool_deposits where member_id = v_g.id)
     or exists (select 1 from public.transfers where from_member_id = v_g.id or to_member_id = v_g.id) then
    raise exception using errcode = 'P0001', message = 'GUEST_IN_USE';
  end if;
  -- 방 활동은 남기고 FK만 끊는다(guest_added payload에 이름이 있다)
  update public.room_events set target_member_id = null where target_member_id = v_g.id;
  delete from public.room_members where id = v_g.id;
end;
$$;

revoke execute on function public._acts_for(uuid, uuid) from public, anon, authenticated;

-- get_payout_account: 계좌 원문 공개 조건에 '내가 대표하는 게스트가 줄 돈이 있는 경우'를 더한다.
-- 게스트 송금을 대표자가 대신 기록·안내하므로, 대표자 본인 net이 0이어도 받는 사람 계좌가 필요하다.
-- 나머지는 20261030010000 정의 그대로(공개 기록·하루 20회 제한 포함).
create or replace function public.get_payout_account(p_room_id uuid, p_owner_member_id uuid)
returns table (registered boolean, bank_name text, holder_name text, account_masked text, account_number text)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  v_owner uuid;
  v_acc public.payout_accounts;
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_reveal boolean;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  v_me := public.my_member_id(p_room_id);
  select m.user_id into v_owner from public.room_members m
  where m.id = p_owner_member_id and m.room_id = p_room_id and m.kind = 'user' and m.left_at is null;
  if v_me is null or v_owner is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  select * into v_acc from public.payout_accounts a where a.user_id = v_owner;
  if v_acc.user_id is null then
    return query select false, null::text, null::text, null::text, null::text;
    return;
  end if;

  v_reveal := v_owner = auth.uid() or (
    exists (select 1 from public.room_balances(p_room_id, false) b
            join public.room_members m on m.id = b.member_id
            where b.net < 0
              and (m.id = v_me or (m.kind = 'guest' and m.representative_member_id = v_me))) and
    (select b.net from public.room_balances(p_room_id, false) b where b.member_id = p_owner_member_id) > 0);

  if v_reveal and v_owner <> auth.uid() then
    perform pg_advisory_xact_lock(hashtext('payout_reveal:' || auth.uid() || ':' || p_room_id));
    if (select count(*) from public.payout_reveals r
        where r.viewer_id = auth.uid() and r.room_id = p_room_id
          and (r.at at time zone 'Asia/Seoul')::date = v_day) >= 20 then
      raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
    end if;
    insert into public.payout_reveals (room_id, viewer_id, owner_id) values (p_room_id, auth.uid(), v_owner);
    insert into public.room_events (room_id, kind, actor_id, target_member_id)
    values (p_room_id, 'payout_reveal', auth.uid(), p_owner_member_id);
  end if;

  return query select true, v_acc.bank_name, v_acc.holder_name, '****-**-***' || v_acc.account_last4,
    case when v_reveal then extensions.pgp_sym_decrypt(v_acc.account_enc, public._payout_key()) end;
end;
$$;
