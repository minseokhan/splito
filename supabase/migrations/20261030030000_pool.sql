-- 공금 지갑 설정 RPC (ARCHITECTURE §5.1 set_pool·upsert_pool_deposits, PRD §7.2 공금, USER_FLOWS J7)
-- 공금 계산(통장 주인 상계)은 room_balances가 맡는다. 여기서는 설정·입금 기록만 한다. 활성 멤버 누구나 호출.

-- 입금은 사람당 1행(참여자는 한 방에만 속한다)
create unique index on public.pool_deposits (member_id);

-- 끄면 통장 주인·카드 끝자리는 무시하고 비운다.
create function public.set_pool(p_room_id uuid, p_enabled boolean, p_owner_member_id uuid, p_card_last4 text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
  v_cards text[] := coalesce(p_card_last4, '{}');
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where id = p_room_id and deleted_at is null for update;
  if v_room.id is null or public.my_member_id(p_room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_enabled is null then raise exception using errcode = 'P0001', message = 'INVALID_INPUT'; end if;

  if not p_enabled then
    if exists (select 1 from public.expenses where room_id = p_room_id and payer_kind = 'pool' and deleted_at is null)
       or exists (select 1 from public.pool_deposits where room_id = p_room_id) then
      raise exception using errcode = 'P0001', message = 'POOL_IN_USE';
    end if;
    update public.rooms set pool_enabled = false, pool_owner_member_id = null, pool_card_last4 = '{}' where id = p_room_id;
    return;
  end if;

  -- 통장 주인: 같은 방의 활성 user 참여자(게스트·나간 멤버 불가)
  if not exists (select 1 from public.room_members
                 where id = p_owner_member_id and room_id = p_room_id and kind = 'user' and left_at is null) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  if cardinality(v_cards) > 5 or exists (select 1 from unnest(v_cards) c where c is null or c !~ '^[0-9]{4}$') then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  if v_room.pool_owner_member_id is not null and v_room.pool_owner_member_id <> p_owner_member_id then
    insert into public.room_events (room_id, kind, actor_id, target_member_id, payload)
    values (p_room_id, 'pool_owner_change', auth.uid(), p_owner_member_id,
            jsonb_build_object('from', v_room.pool_owner_member_id, 'to', p_owner_member_id));
  end if;
  update public.rooms set pool_enabled = true, pool_owner_member_id = p_owner_member_id, pool_card_last4 = v_cards
  where id = p_room_id;
end;
$$;

-- p_rows = [{member_id, amount_krw}]. 행에 있는 사람의 입금 합계를 그 값으로 맞춘다(0이면 삭제). 없는 사람은 그대로.
create function public.upsert_pool_deposits(p_room_id uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
  v_row jsonb;
  v_m public.room_members;
  v_amount numeric;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where id = p_room_id and deleted_at is null for update;
  if v_room.id is null or public.my_member_id(p_room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if not v_room.pool_enabled then raise exception using errcode = 'P0001', message = 'INVALID_PAYER'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception using errcode = 'P0001', message = 'INVALID_INPUT'; end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row -> 'amount_krw') is distinct from 'number' then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
    end if;
    v_amount := (v_row ->> 'amount_krw')::numeric;
    if v_amount < 0 or v_amount <> trunc(v_amount) then raise exception using errcode = 'P0001', message = 'INVALID_INPUT'; end if;

    select * into v_m from public.room_members where room_id = p_room_id and id::text = v_row ->> 'member_id';
    if v_m.id is null then raise exception using errcode = 'P0001', message = 'INVALID_INPUT'; end if;
    if v_m.left_at is not null then raise exception using errcode = 'P0001', message = 'MEMBER_LEFT'; end if;

    delete from public.pool_deposits where member_id = v_m.id;
    if v_amount > 0 then
      insert into public.pool_deposits (room_id, member_id, amount_krw, created_by)
      values (p_room_id, v_m.id, v_amount::bigint, auth.uid());
    end if;
  end loop;
end;
$$;

revoke execute on function public.set_pool(uuid, boolean, uuid, text[]), public.upsert_pool_deposits(uuid, jsonb)
  from public, anon;
grant execute on function public.set_pool(uuid, boolean, uuid, text[]), public.upsert_pool_deposits(uuid, jsonb)
  to authenticated;
