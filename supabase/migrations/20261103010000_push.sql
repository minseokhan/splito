-- 푸시 알림 (지출 등록·댓글·송금 요청/확인)
-- 발송 경로: DB 트리거 → pg_net(비동기, 커밋 후 발송) → Edge Function `push` → Expo Push API.
-- 문구·대상·딥링크 경로는 전부 여기서 만든다. Edge Function은 포워더라 로직이 중복되지 않는다.
-- CRITICAL: 알림 실패는 장부 쓰기를 절대 막지 않는다(_push가 모든 예외를 삼킨다).

create extension if not exists pg_net with schema extensions;

-- ───────────────────────── 토큰 ─────────────────────────

create table public.push_tokens (
  token text primary key,                                   -- ExponentPushToken[...]
  user_id uuid not null references public.profiles (id),
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);

-- 알림 수신 여부. 기기별이 아니라 계정별로 끈다(토큰을 지우면 재설치 때 되살아난다).
alter table public.profiles add column push_enabled boolean not null default true;
grant update (push_enabled) on public.profiles to authenticated;

alter table public.push_tokens enable row level security;
create policy push_tokens_select on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
-- 쓰기는 RPC로만(장부는 아니지만 남의 토큰을 심을 수 있으면 알림을 가로챌 수 있다).

-- ───────────────────────── 토큰 등록·해제 RPC ─────────────────────────

create function public.set_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if coalesce(p_token, '') !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,100}\]$'
     or p_platform not in ('ios', 'android') then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT';
  end if;
  -- 같은 기기에 다른 계정이 로그인하면 토큰 주인이 바뀐다.
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

-- 로그아웃·알림 끄기. 내 토큰만 지운다.
create function public.delete_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end;
$$;

revoke execute on function public.set_push_token(text, text), public.delete_push_token(text) from public, anon;
grant execute on function public.set_push_token(text, text), public.delete_push_token(text) to authenticated;

-- ───────────────────────── 발송 ─────────────────────────

-- 대상 user_id → 토큰 → Edge Function. 엔드포인트·시크릿이 Vault에 없으면 조용히 건너뛴다
-- (로컬·테스트 DB에는 시크릿이 없다. 없다고 지출 저장이 깨지면 안 된다).
create function public._push(p_targets uuid[], p_title text, p_body text, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
  v_tokens text[];
begin
  begin
    if coalesce(array_length(p_targets, 1), 0) = 0 then return; end if;
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_endpoint';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret';
    if v_url is null or v_secret is null then return; end if;

    select array_agg(t.token) into v_tokens
    from public.push_tokens t join public.profiles p on p.id = t.user_id
    where t.user_id = any (p_targets) and p.push_enabled and p.deleted_at is null;
    if v_tokens is null then return; end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('tokens', to_jsonb(v_tokens), 'title', p_title, 'body', p_body, 'path', p_path),
      timeout_milliseconds := 5000);
  exception when others then
    raise warning 'push skipped: %', sqlerrm;  -- 알림 실패가 장부 쓰기를 막으면 안 된다
  end;
end;
$$;

-- 방의 활성 유저 멤버(게스트 제외) user_id. p_except(행위자)는 뺀다.
create function public._room_user_ids(p_room_id uuid, p_except uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.user_id), '{}')
  from public.room_members m
  where m.room_id = p_room_id and m.kind = 'user' and m.left_at is null
    and m.user_id is distinct from p_except;
$$;

create function public._push_nickname(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(nickname, ''), '누군가') from public.profiles where id = p_user_id;
$$;

create function public._push_room_name(p_room_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select name from public.rooms where id = p_room_id;
$$;

create function public._member_user_id(p_member_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.room_members where id = p_member_id;
$$;

revoke execute on function public._push(uuid[], text, text, text), public._room_user_ids(uuid, uuid),
  public._push_nickname(uuid), public._push_room_name(uuid), public._member_user_id(uuid)
  from public, anon, authenticated;

-- ───────────────────────── 트리거 ─────────────────────────

-- 지출 등록. '나만 보기'는 남이 못 읽으므로 알림도 보내지 않는다.
create function public._notify_expense() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility <> 'shared' then return new; end if;
  perform public._push(
    public._room_user_ids(new.room_id, new.created_by),
    public._push_room_name(new.room_id),
    public._push_nickname(new.created_by) || '님이 지출을 올렸어요. 확인 후 본인에게 해당되는 항목에 체크해주세요!',
    '/rooms/' || new.room_id || '/expenses/' || new.id);
  return new;
end;
$$;

create trigger notify_expense after insert on public.expenses
  for each row execute function public._notify_expense();

-- 댓글. 읽을 수 없는 지출(남의 '나만 보기')에는 애초에 댓글이 안 달리지만 방어적으로 같은 기준을 쓴다.
create function public._notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_visibility text;
begin
  select visibility into v_visibility from public.expenses where id = new.expense_id;
  if v_visibility <> 'shared' then return new; end if;
  perform public._push(
    public._room_user_ids(new.room_id, new.author_id),
    public._push_room_name(new.room_id),
    public._push_nickname(new.author_id) || ': ' || left(new.body, 60),
    '/rooms/' || new.room_id || '/expenses/' || new.expense_id);
  return new;
end;
$$;

create trigger notify_comment after insert on public.comments
  for each row execute function public._notify_comment();

create function public._push_krw(p_amount bigint) returns text
language sql immutable set search_path = '' as $$
  select trim(to_char(p_amount, 'FM999,999,999,999')) || '원';
$$;
revoke execute on function public._push_krw(bigint) from public, anon, authenticated;

-- 송금. 보낸 쪽이 기록하면 받을 사람이 확인해야 하고, 받은 쪽이 기록하면 이미 확인된 상태로 들어온다.
create function public._notify_transfer_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.confirmed_at is null then
    perform public._push(
      array[public._member_user_id(new.to_member_id)],
      public._push_room_name(new.room_id),
      public._push_nickname(public._member_user_id(new.from_member_id)) || '님이 ' || public._push_krw(new.amount_krw)
        || '을 보냈다고 기록했어요. 받으셨는지 확인해주세요.',
      '/rooms/' || new.room_id || '/settle');
  else
    perform public._push(
      array[public._member_user_id(new.from_member_id)],
      public._push_room_name(new.room_id),
      public._push_nickname(public._member_user_id(new.to_member_id)) || '님이 ' || public._push_krw(new.amount_krw)
        || '을 받았다고 확인했어요.',
      '/rooms/' || new.room_id || '/settle');
  end if;
  return new;
end;
$$;

create trigger notify_transfer_insert after insert on public.transfers
  for each row execute function public._notify_transfer_insert();

-- 확인·거절은 보낸 사람에게, 취소는 받을 사람에게.
create function public._notify_transfer_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.confirmed_at is null and new.confirmed_at is not null then
    perform public._push(
      array[public._member_user_id(new.from_member_id)],
      public._push_room_name(new.room_id),
      public._push_nickname(public._member_user_id(new.to_member_id)) || '님이 ' || public._push_krw(new.amount_krw)
        || '을 받았다고 확인했어요.',
      '/rooms/' || new.room_id || '/settle');
  elsif old.voided_at is null and new.voided_at is not null then
    if new.void_reason = 'cancelled' then
      perform public._push(
        array[public._member_user_id(new.to_member_id)],
        public._push_room_name(new.room_id),
        public._push_nickname(public._member_user_id(new.from_member_id)) || '님이 ' || public._push_krw(new.amount_krw)
          || ' 송금 기록을 취소했어요.',
        '/rooms/' || new.room_id || '/settle');
    else
      perform public._push(
        array[public._member_user_id(new.from_member_id)],
        public._push_room_name(new.room_id),
        public._push_nickname(public._member_user_id(new.to_member_id)) || '님이 ' || public._push_krw(new.amount_krw)
          || '을 아직 못 받았다고 해요.',
        '/rooms/' || new.room_id || '/settle');
    end if;
  end if;
  return new;
end;
$$;

create trigger notify_transfer_update after update on public.transfers
  for each row execute function public._notify_transfer_update();

-- 트리거 함수는 트리거로만 불린다. PostgREST에 RPC로 노출되지 않게 회수한다.
revoke execute on function public._notify_expense(), public._notify_comment(),
  public._notify_transfer_insert(), public._notify_transfer_update() from public, anon, authenticated;
