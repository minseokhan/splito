-- 여행 패스 구매 기록. 방(여행)마다 한 번, 방장이 대표로 산다. 행이 있으면 그 방은 '패스 이용 중'이다.
-- 결제 연동 전이라 쓰기 RPC는 아직 없다(개발 데이터는 SQL로 넣는다). 클라이언트는 읽기만 한다.
-- split: 동행과 1/N로 나눴는지. 나눈 경우 정산 반영(지출 등록)은 결제 RPC를 만들 때 함께 한다.
create table public.room_passes (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  paid_by_member_id uuid not null references public.room_members (id),
  amount_krw bigint not null default 5400 check (amount_krw > 0),
  split boolean not null default false,
  method text check (method in ('toss', 'kakao', 'card')),
  purchased_at timestamptz not null default now()
);

alter table public.room_passes enable row level security;
create policy room_passes_select on public.room_passes for select to authenticated using (public.is_room_member(room_id));

revoke all on public.room_passes from anon, authenticated;
grant select on public.room_passes to authenticated;
