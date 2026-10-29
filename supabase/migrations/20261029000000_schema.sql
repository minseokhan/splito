-- 스플리토 전체 스키마 + RLS + 권한 회수 (ARCHITECTURE §3·§4, ADR-002·006·011)
-- 원화는 bigint, 외화 원본 numeric(18,3), 환율 numeric(18,6). enum은 text + check.
-- 장부 쓰기는 security definer RPC로만 한다(다음 step). 클라이언트 쓰기 예외: comments, 본인 profiles 일부 컬럼.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── 테이블 ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id),  -- cascade 없음: 탈퇴해도 장부가 남아야 한다
  nickname text not null default '' check (char_length(nickname) <= 12),
  avatar_url text,
  terms_version text,
  terms_agreed_at timestamptz,
  age14_confirmed_at timestamptz,
  overseas_notice_ack_at timestamptz,
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  ai_notice_ack_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payout_accounts (
  user_id uuid primary key references public.profiles (id),
  bank_code text not null,
  bank_name text not null,
  holder_name text not null,
  account_enc bytea not null,  -- pgp_sym_encrypt(Vault 키) 결과. 원문 저장 금지
  account_last4 char(4) not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_currency char(3) not null,
  start_date date,
  end_date date,
  owner_id uuid not null references public.profiles (id),
  invite_token text not null unique,
  pool_enabled boolean not null default false,
  pool_owner_member_id uuid,
  pool_card_last4 text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  kind text not null check (kind in ('user', 'guest')),
  user_id uuid references public.profiles (id),
  guest_name text check (char_length(guest_name) between 1 and 12),
  representative_member_id uuid,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  removed_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.room_fx_overrides (
  room_id uuid not null references public.rooms (id),
  currency char(3) not null,
  rate numeric(18, 6) not null check (rate > 0),
  set_by uuid references public.profiles (id),
  set_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (room_id, currency)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),  -- 클라이언트 UUID
  room_id uuid not null references public.rooms (id),
  created_by uuid not null references public.profiles (id),
  updated_by uuid references public.profiles (id),
  payer_kind text not null check (payer_kind in ('member', 'pool')),
  payer_member_id uuid,
  source text not null check (source in ('receipt', 'card_text', 'card_image', 'voice', 'manual')),
  merchant text,
  paid_local_date date not null,
  paid_local_time time,
  currency char(3) not null,
  amount_original numeric(18, 3) not null,
  krw_amount bigint,
  fx_rate numeric(18, 6),
  fx_base_date date,
  fx_source text not null check (fx_source in ('kexim', 'card_krw', 'krw', 'manual', 'pending')),
  krw_charged bigint,
  card_last4 char(4),
  needs_review boolean not null default false,
  ai_result jsonb,
  version int not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.expense_photos (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  room_id uuid not null,
  storage_path text not null unique,
  kind text not null check (kind in ('receipt', 'capture')),
  created_at timestamptz not null default now()
);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  room_id uuid not null,
  position int not null,
  name_original text not null,
  name_ko text,
  quantity numeric(10, 3) not null default 1,
  amount_original numeric(18, 3) not null,
  krw_amount bigint,  -- 지출이 pending이면 NULL
  needs_review boolean not null default false,
  is_adjustment boolean not null default false,
  created_at timestamptz not null default now(),
  unique (expense_id, position)
);

create table public.expense_scope (
  expense_id uuid not null,
  member_id uuid not null,
  room_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (expense_id, member_id)
);

create table public.item_assignees (
  item_id uuid not null,
  member_id uuid not null,
  room_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (item_id, member_id)
);

create table public.expense_history (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  room_id uuid not null,
  actor_id uuid references public.profiles (id),
  action text not null check (action in ('create', 'update', 'delete', 'restore', 'merge', 'scope_add')),
  snapshot jsonb not null,
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  room_id uuid not null,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.pool_deposits (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  member_id uuid not null,
  amount_krw bigint not null check (amount_krw > 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),  -- 클라이언트 UUID
  room_id uuid not null references public.rooms (id),
  from_member_id uuid not null,
  to_member_id uuid not null,
  amount_krw bigint not null check (amount_krw > 0),
  recorded_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text check (void_reason in ('cancelled', 'not_received')),
  created_at timestamptz not null default now()
);

create table public.fx_rates (
  base_date date not null,
  currency char(3) not null,
  rate numeric(18, 6) not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (base_date, currency)
);

create table public.ai_usage (
  scope text not null check (scope in ('user', 'room', 'global')),
  scope_id text not null,
  day date not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  primary key (scope, scope_id, day)
);

create table public.payout_reveals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  viewer_id uuid not null references public.profiles (id),
  owner_id uuid not null references public.profiles (id),
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.room_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  kind text not null check (kind in ('join', 'leave', 'removed', 'guest_added', 'guest_rep_change', 'owner_change',
                                     'pool_owner_change', 'payout_reveal', 'payout_request', 'transfer')),
  actor_id uuid references public.profiles (id),
  target_member_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ───────────────────────── 제약·인덱스 (ARCHITECTURE §3) ─────────────────────────

alter table public.room_members add unique (id, room_id),
  add check ((kind = 'user') = (user_id is not null)),
  add check ((kind = 'guest') = (guest_name is not null and representative_member_id is not null)),
  add foreign key (representative_member_id, room_id) references public.room_members (id, room_id);
create unique index on public.room_members (room_id, user_id) where user_id is not null;
alter table public.expenses add unique (id, room_id),
  add foreign key (payer_member_id, room_id) references public.room_members (id, room_id),
  add check ((payer_kind = 'member') = (payer_member_id is not null)),
  add check ((fx_source = 'pending') = (krw_amount is null)),
  add check (currency <> 'KRW' or fx_source = 'krw'),
  add check (amount_original > 0);
alter table public.expense_items add unique (id, room_id),
  add foreign key (expense_id, room_id) references public.expenses (id, room_id) on delete cascade;
alter table public.expense_photos add foreign key (expense_id, room_id) references public.expenses (id, room_id) on delete cascade;
alter table public.expense_scope add foreign key (expense_id, room_id) references public.expenses (id, room_id) on delete cascade,
  add foreign key (member_id, room_id) references public.room_members (id, room_id);
alter table public.item_assignees add foreign key (item_id, room_id) references public.expense_items (id, room_id) on delete cascade,
  add foreign key (member_id, room_id) references public.room_members (id, room_id);
alter table public.expense_history add foreign key (expense_id, room_id) references public.expenses (id, room_id);
alter table public.comments add foreign key (expense_id, room_id) references public.expenses (id, room_id);
alter table public.pool_deposits add foreign key (member_id, room_id) references public.room_members (id, room_id);
alter table public.rooms add foreign key (pool_owner_member_id) references public.room_members (id);
alter table public.transfers
  add foreign key (from_member_id, room_id) references public.room_members (id, room_id),
  add foreign key (to_member_id, room_id) references public.room_members (id, room_id),
  add check (from_member_id <> to_member_id);
alter table public.room_events add foreign key (target_member_id, room_id) references public.room_members (id, room_id);
create index on public.expenses (room_id, paid_local_date desc, created_at desc) where deleted_at is null;
create index on public.expense_items (expense_id);
create index on public.comments (expense_id);
create index on public.transfers (room_id);
create index on public.pool_deposits (room_id);
create index on public.room_members (user_id) where left_at is null;

-- ───────────────────────── 함수 ─────────────────────────

-- 신규 가입 시 프로필 생성. 닉네임은 SNS 메타데이터에서 12자까지, 없으면 빈 문자열.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'nickname', ''),
                  nullif(new.raw_user_meta_data ->> 'name', ''),
                  nullif(new.raw_user_meta_data ->> 'full_name', ''), ''), 12),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 호출자가 이 방의 활성 가입 멤버이고 방이 삭제되지 않았을 때만 true. 읽기 RLS의 기준.
create function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m join public.rooms r on r.id = m.room_id
    where m.room_id = p_room_id and m.user_id = auth.uid() and m.kind = 'user'
      and m.left_at is null and r.deleted_at is null
  );
$$;

-- 호출자의 활성 참여자 ID(없으면 NULL). RPC에서 재사용.
create function public.my_member_id(p_room_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.room_members m join public.rooms r on r.id = m.room_id
  where m.room_id = p_room_id and m.user_id = auth.uid() and m.kind = 'user'
    and m.left_at is null and r.deleted_at is null;
$$;

-- 같은 방 사람(나간 멤버 포함)의 공개 프로필. profiles RLS는 본인만이라 definer 함수로 걸러서 뷰가 감싼다.
create function public.member_profile_rows() returns table (id uuid, nickname text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nickname, p.avatar_url from public.profiles p
  where exists (select 1 from public.room_members m where m.user_id = p.id and public.is_room_member(m.room_id));
$$;

create view public.member_profiles with (security_invoker = true) as
  select id, nickname, avatar_url from public.member_profile_rows();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_room_member(uuid), public.my_member_id(uuid), public.member_profile_rows() from public, anon;
grant execute on function public.is_room_member(uuid), public.my_member_id(uuid), public.member_profile_rows() to authenticated;

-- ───────────────────────── 권한 ─────────────────────────
-- anon은 아무것도 못 한다. authenticated는 SELECT만(RLS로 거름). 쓰기 예외만 컬럼 단위로 다시 연다.

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

grant update (nickname, terms_version, terms_agreed_at, age14_confirmed_at, overseas_notice_ack_at,
              marketing_opt_in, marketing_opt_in_at, ai_notice_ack_at) on public.profiles to authenticated;
grant insert (id, expense_id, room_id, author_id, body) on public.comments to authenticated;
grant update (body, deleted_at) on public.comments to authenticated;

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_fx_overrides enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_photos enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_scope enable row level security;
alter table public.item_assignees enable row level security;
alter table public.expense_history enable row level security;
alter table public.comments enable row level security;
alter table public.pool_deposits enable row level security;
alter table public.transfers enable row level security;
alter table public.fx_rates enable row level security;
alter table public.ai_usage enable row level security;          -- 정책 없음: RPC·Edge Function만
alter table public.payout_reveals enable row level security;    -- 정책 없음: RPC만
alter table public.room_events enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy payout_accounts_select on public.payout_accounts for select to authenticated using (user_id = auth.uid());
create policy rooms_select on public.rooms for select to authenticated using (public.is_room_member(id));
create policy room_members_select on public.room_members for select to authenticated using (public.is_room_member(room_id));
create policy room_fx_overrides_select on public.room_fx_overrides for select to authenticated using (public.is_room_member(room_id));
create policy expenses_select on public.expenses for select to authenticated
  using (deleted_at is null and public.is_room_member(room_id));
create policy expense_photos_select on public.expense_photos for select to authenticated using (public.is_room_member(room_id));
create policy expense_items_select on public.expense_items for select to authenticated using (public.is_room_member(room_id));
create policy expense_scope_select on public.expense_scope for select to authenticated using (public.is_room_member(room_id));
create policy item_assignees_select on public.item_assignees for select to authenticated using (public.is_room_member(room_id));
create policy expense_history_select on public.expense_history for select to authenticated using (public.is_room_member(room_id));
create policy comments_select on public.comments for select to authenticated using (public.is_room_member(room_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_room_member(room_id));
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy pool_deposits_select on public.pool_deposits for select to authenticated using (public.is_room_member(room_id));
create policy transfers_select on public.transfers for select to authenticated using (public.is_room_member(room_id));
create policy fx_rates_select on public.fx_rates for select to authenticated using (true);
create policy room_events_select on public.room_events for select to authenticated using (public.is_room_member(room_id));

-- ───────────────────────── Storage ─────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg']);

create policy receipts_rw on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and public.is_room_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'receipts' and public.is_room_member(((storage.foldername(name))[1])::uuid));

-- ───────────────────────── Realtime ─────────────────────────

alter publication supabase_realtime add table public.expenses, public.comments, public.room_members,
  public.transfers, public.pool_deposits, public.rooms, public.room_events;
