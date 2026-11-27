-- 초대 참여 플로우(노션 31번): 초대 7일 만료 · 참여 코드 6자리 · 초대 확인 정보 보강 · 게스트로 참여(나 고르기) · 참여 알림.
-- 링크(토큰)와 코드는 한 쌍이다. 토큰을 새로 발급하면(rotate_invite·remove_member·current_invite) 코드와 발급 시각도 같이 바뀐다.
-- 없음·만료·교체·삭제된 방은 모두 INVITE_INVALID(이유 구분 금지, 기존 규칙 유지).

alter table public.rooms
  add column invite_code text,
  add column invite_issued_at timestamptz not null default now();  -- 기존 방은 이 마이그레이션 시점부터 7일

-- 헷갈리는 글자(0·O·1·I)를 뺀 32자. 256이 32로 나눠떨어져 바이트 % 32가 고르다.
-- 무작위 대입은 resolve_invite_code의 실패 횟수 제한이 막는다.
create function public._new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    select string_agg(substr(v_chars, get_byte(b, i) % 32 + 1, 1), '' order by i) into v_code
    from (select extensions.gen_random_bytes(6) as b) x, generate_series(0, 5) i;
    exit when not exists (select 1 from public.rooms where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

do $$
declare
  r record;
begin
  for r in select id from public.rooms loop
    update public.rooms set invite_code = public._new_invite_code() where id = r.id;
  end loop;
end;
$$;

alter table public.rooms alter column invite_code set not null, add unique (invite_code);

create function public._invite_issue() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.invite_token is distinct from old.invite_token then
    new.invite_code := public._new_invite_code();
    new.invite_issued_at := now();
  end if;
  return new;
end;
$$;

create trigger invite_issue before insert or update of invite_token on public.rooms
  for each row execute function public._invite_issue();

-- ───────────────────────── 기존 RPC에 만료 반영 (20261029010000 정의 + 발급 7일 조건) ─────────────────────────

create or replace function public.preview_invite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where invite_token = p_token and deleted_at is null
    and invite_issued_at > now() - interval '7 days';
  if not found then raise exception using errcode = 'P0001', message = 'INVITE_INVALID'; end if;

  return jsonb_build_object(
    'room_id', v_room.id,
    'room_name', v_room.name,
    'inviter_nickname', (select nickname from public.profiles where id = v_room.owner_id),
    'member_count', (select count(*) from public.room_members where room_id = v_room.id and left_at is null),
    'already_member', exists (select 1 from public.room_members
                              where room_id = v_room.id and user_id = auth.uid() and left_at is null)
  );
end;
$$;

create or replace function public.join_room(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
  v_member public.room_members;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select id into v_room_id from public.rooms where invite_token = p_token and deleted_at is null
    and invite_issued_at > now() - interval '7 days' for update;
  if not found then raise exception using errcode = 'P0001', message = 'INVITE_INVALID'; end if;

  select * into v_member from public.room_members where room_id = v_room_id and user_id = auth.uid();
  if not found then
    insert into public.room_members (room_id, kind, user_id, created_by)
    values (v_room_id, 'user', auth.uid(), auth.uid())
    returning * into v_member;
    insert into public.room_events (room_id, kind, actor_id, target_member_id)
    values (v_room_id, 'join', auth.uid(), v_member.id);
  elsif v_member.left_at is not null then
    -- 재합류: 같은 참여자 ID, joined_at 유지
    update public.room_members set left_at = null, removed_by = null where id = v_member.id;
  end if;

  return v_room_id;
end;
$$;

-- ───────────────────────── 새 RPC ─────────────────────────

-- 초대 확인 화면(①)·나 고르기(③)용. preview_invite의 상위 집합 — preview_invite는 이미 깔린 앱 빌드 호환으로 남긴다.
-- guests: 이 방에 내 행(나간 행 포함)이 없을 때만 준다. 행이 있으면 같은 참여자 ID로 재합류해야 해서 게스트를 고를 수 없다.
create function public.preview_invite_detail(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_room public.rooms;
  v_has_row boolean;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where invite_token = p_token and deleted_at is null
    and invite_issued_at > now() - interval '7 days';
  if not found then raise exception using errcode = 'P0001', message = 'INVITE_INVALID'; end if;
  v_has_row := exists (select 1 from public.room_members where room_id = v_room.id and user_id = auth.uid());

  return jsonb_build_object(
    'room_id', v_room.id,
    'room_name', v_room.name,
    'inviter_nickname', (select nickname from public.profiles where id = v_room.owner_id),
    'member_count', (select count(*) from public.room_members where room_id = v_room.id and left_at is null),
    'already_member', exists (select 1 from public.room_members
                              where room_id = v_room.id and user_id = auth.uid() and left_at is null),
    'start_date', v_room.start_date,
    'end_date', v_room.end_date,
    'base_currency', v_room.base_currency,
    'expense_count', (select count(*) from public.expenses
                      where room_id = v_room.id and deleted_at is null and visibility = 'shared'),
    'members', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(m.guest_name, p.nickname, ''),
                                                             'guest', m.kind = 'guest')
                                                  order by m.user_id is not distinct from v_room.owner_id desc, m.joined_at, m.id)
                         from public.room_members m left join public.profiles p on p.id = m.user_id
                         where m.room_id = v_room.id and m.left_at is null), '[]'::jsonb),
    'guests', case when v_has_row then '[]'::jsonb else
                coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.guest_name) order by m.joined_at, m.id)
                          from public.room_members m
                          where m.room_id = v_room.id and m.kind = 'guest' and not m.spot_only and m.left_at is null), '[]'::jsonb) end
  );
end;
$$;

-- 나 고르기(③): 고른 게스트 행을 내 계정 참여자로 바꾼다. 참여자 ID가 그대로라 결제·대상·품목 지정·잔액이 모두 따라온다.
-- 게스트가 삭제됐거나 다른 사람이 먼저 골랐거나 이 방에 내 행이 이미 있으면 JOIN_UNAVAILABLE.
create function public.join_room_as_guest(p_token text, p_guest_member_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select id into v_room_id from public.rooms where invite_token = p_token and deleted_at is null
    and invite_issued_at > now() - interval '7 days' for update;
  if not found then raise exception using errcode = 'P0001', message = 'INVITE_INVALID'; end if;
  if exists (select 1 from public.room_members where room_id = v_room_id and user_id = auth.uid()) then
    raise exception using errcode = 'P0001', message = 'JOIN_UNAVAILABLE';
  end if;

  select guest_name into v_name from public.room_members
  where id = p_guest_member_id and room_id = v_room_id and kind = 'guest' and not spot_only and left_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'JOIN_UNAVAILABLE'; end if;

  update public.room_members
  set kind = 'user', user_id = auth.uid(), guest_name = null, representative_member_id = null
  where id = p_guest_member_id;

  insert into public.room_events (room_id, kind, actor_id, target_member_id, payload)
  values (v_room_id, 'join', auth.uid(), p_guest_member_id, jsonb_build_object('guest_name', v_name));
  return v_room_id;
end;
$$;

-- 참여 코드 무차별 대입 방지: 실패 시도만 기록한다. 클라이언트는 읽지도 쓰지도 못한다(RLS on, 정책 없음, 권한 회수).
-- ponytail: 오래된 행을 지우지 않는다 — 쌓이면 1시간 지난 행을 지우는 정리 작업을 붙인다.
create table public.invite_code_attempts (
  user_id uuid not null references public.profiles (id),
  attempted_at timestamptz not null default now()
);
create index on public.invite_code_attempts (user_id, attempted_at);
alter table public.invite_code_attempts enable row level security;
revoke all on public.invite_code_attempts from anon, authenticated;

-- 홈 [초대받은 여행 참여하기]: 참여 코드 → 초대 토큰. 이후는 링크와 같은 합류 화면을 탄다.
-- 없거나 만료된 코드면 실패를 기록하고 null을 돌려준다(예외를 던지면 기록까지 롤백된다) — 앱이 INVITE_INVALID로 바꾼다.
-- 최근 1시간에 실패가 10번 쌓였으면 맞는 코드여도 TOO_MANY_ATTEMPTS.
-- 32^6 ≈ 10억 칸에 시간당 10번이라 무작위 대입은 사실상 막히고, 코드는 7일이면 만료된다.
create function public.resolve_invite_code(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  -- 같은 사용자의 동시 호출이 카운트를 함께 통과하지 못하게 사용자별로 줄 세운다.
  perform pg_advisory_xact_lock(hashtext('invite_code:' || auth.uid()::text));
  if (select count(*) from public.invite_code_attempts
      where user_id = auth.uid() and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception using errcode = 'P0001', message = 'TOO_MANY_ATTEMPTS';
  end if;
  select invite_token into v_token from public.rooms
  where invite_code = upper(btrim(coalesce(p_code, ''))) and deleted_at is null
    and invite_issued_at > now() - interval '7 days';
  if not found then
    insert into public.invite_code_attempts (user_id) values (auth.uid());
    return null;
  end if;
  return v_token;
end;
$$;

-- 초대 시트(링크·QR·코드)용. 7일이 지났으면 그 자리에서 새로 발급한다 — 방장이 따로 재발급하지 않아도 공유하는 링크는 늘 살아 있다.
-- 활성 멤버 누구나 호출한다(초대 시트는 멤버 모두에게 열려 있다).
create function public.current_invite(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into v_room from public.rooms where id = p_room_id and deleted_at is null for update;
  if not found or public.my_member_id(p_room_id) is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if v_room.invite_issued_at <= now() - interval '7 days' then
    update public.rooms set invite_token = public.new_invite_token() where id = p_room_id
    returning * into v_room;
  end if;
  return jsonb_build_object('token', v_room.invite_token, 'code', v_room.invite_code,
                            'expires_at', v_room.invite_issued_at + interval '7 days');
end;
$$;

-- ④ 방장에게 "○○님이 참여했어요" 알림. 실패해도 합류를 막지 않는다(_push가 예외를 삼킨다).
create function public._notify_join() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._push(
    array(select owner_id from public.rooms where id = new.room_id and owner_id is distinct from new.actor_id),
    public._push_room_name(new.room_id),
    public._push_nickname(new.actor_id) || '님이 참여했어요',
    '/rooms/' || new.room_id);
  return new;
end;
$$;

create trigger notify_join after insert on public.room_events
  for each row when (new.kind = 'join') execute function public._notify_join();

revoke execute on function public._new_invite_code(), public._invite_issue(), public._notify_join()
  from public, anon, authenticated;
revoke execute on function public.preview_invite_detail(text), public.join_room_as_guest(text, uuid),
  public.resolve_invite_code(text), public.current_invite(uuid) from public, anon;
grant execute on function public.preview_invite_detail(text), public.join_room_as_guest(text, uuid),
  public.resolve_invite_code(text), public.current_invite(uuid) to authenticated;
