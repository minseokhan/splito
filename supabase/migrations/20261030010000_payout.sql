-- 받을 계좌 암호화 저장·조건부 원문 조회·계좌 요청 (ARCHITECTURE §4 계좌번호·§5.1, PRD §6 F8.1·§7.3)
-- 키는 Vault 시크릿 'payout_account_key'. 마이그레이션은 키를 만들지 않는다(로컬은 seed.sql의 개발용 키).
-- 원문은 account_enc(pgp_sym_encrypt)에만 있다. 로그·room_events.payload에 남기지 않는다.

create function public._payout_key() returns text
language plpgsql stable set search_path = '' as $$
declare
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'payout_account_key');
begin
  if v_key is null then raise exception 'payout_account_key missing in Vault'; end if;
  return v_key;
end;
$$;
revoke execute on function public._payout_key() from public, anon, authenticated;

create function public.set_payout_account(p_bank_code text, p_bank_name text, p_holder_name text, p_account_number text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_digits text := regexp_replace(coalesce(p_account_number, ''), '-', '', 'g');
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if p_account_number !~ '^[0-9-]+$' or length(v_digits) not between 8 and 20
     or coalesce(trim(p_bank_code), '') = '' or coalesce(trim(p_bank_name), '') = '' or coalesce(trim(p_holder_name), '') = '' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;

  insert into public.payout_accounts (user_id, bank_code, bank_name, holder_name, account_enc, account_last4)
  values (auth.uid(), p_bank_code, p_bank_name, p_holder_name,
          extensions.pgp_sym_encrypt(p_account_number, public._payout_key()), right(v_digits, 4))
  on conflict (user_id) do update
    set bank_code = excluded.bank_code, bank_name = excluded.bank_name, holder_name = excluded.holder_name,
        account_enc = excluded.account_enc, account_last4 = excluded.account_last4, updated_at = now();
end;
$$;

-- 원문 조건: 본인 계좌이거나, room_balances(화면용) 기준 호출자 net < 0 이고 주인 net > 0.
-- 남의 원문을 줄 때만 payout_reveals + room_event를 남기고 (조회자, 방)당 KST 하루 20회로 제한한다.
create function public.get_payout_account(p_room_id uuid, p_owner_member_id uuid)
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
    (select b.net from public.room_balances(p_room_id, false) b where b.member_id = v_me) < 0 and
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

create function public.request_payout_account(p_room_id uuid, p_owner_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.my_member_id(p_room_id) is null
     or not exists (select 1 from public.room_members
                    where id = p_owner_member_id and room_id = p_room_id and kind = 'user' and left_at is null) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  insert into public.room_events (room_id, kind, actor_id, target_member_id)
  values (p_room_id, 'payout_request', auth.uid(), p_owner_member_id);
end;
$$;

revoke execute on function public.set_payout_account(text, text, text, text) from public, anon;
revoke execute on function public.get_payout_account(uuid, uuid) from public, anon;
revoke execute on function public.request_payout_account(uuid, uuid) from public, anon;
grant execute on function public.set_payout_account(text, text, text, text) to authenticated;
grant execute on function public.get_payout_account(uuid, uuid) to authenticated;
grant execute on function public.request_payout_account(uuid, uuid) to authenticated;
