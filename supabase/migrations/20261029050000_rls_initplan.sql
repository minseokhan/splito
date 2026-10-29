-- RLS 정책의 auth.uid()를 (select auth.uid())로 감싼다. 행마다 재평가되지 않고 쿼리당 한 번만 계산된다.
-- Supabase lint 0003 auth_rls_initplan. 정책 의미는 그대로다.

alter policy profiles_select on public.profiles using (id = (select auth.uid()));
alter policy profiles_update on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy payout_accounts_select on public.payout_accounts using (user_id = (select auth.uid()));
alter policy comments_insert on public.comments
  with check (author_id = (select auth.uid()) and public.is_room_member(room_id));
alter policy comments_update on public.comments
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
