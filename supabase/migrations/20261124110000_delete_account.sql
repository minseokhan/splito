-- 회원 탈퇴(노션 26번, PRD F9.2 · App Store 5.1.1(v)).
-- 로그인 계정(auth.users)·받을 계좌·푸시 토큰은 지우고, 프로필은 deleted_at을 찍어 남긴다.
-- 공동 장부(지출·송금·멤버)는 다른 참여자의 정산을 위해 그대로 두고, 동행에게는 '탈퇴한 사용자'로 보인다.
-- 노션 26번: 정산이 남은 여행이 있어도 탈퇴할 수 있다(PRD의 ACCOUNT_HAS_BALANCE 차단은 폐기).

-- profiles는 탈퇴 뒤에도 장부의 이름표로 남아야 하므로 auth.users와의 FK를 끊는다.
alter table public.profiles drop constraint profiles_id_fkey;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  delete from public.payout_accounts where user_id = v_uid;
  delete from public.push_tokens where user_id = v_uid;
  -- 동의 기록(terms_*·age14·overseas·ai_notice)은 분쟁 대비로 남긴다(PRD: 탈퇴 후 1년 보관).
  update public.profiles
     set nickname = '', avatar_url = null, marketing_opt_in = false, push_enabled = false, deleted_at = now()
   where id = v_uid;
  delete from auth.users where id = v_uid;  -- identities·sessions·refresh tokens는 auth 쪽 cascade로 함께 지워진다
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 탈퇴한 사람의 프로필은 동행에게 내려주지 않는다 → 클라이언트가 '탈퇴한 사용자'로 표시한다.
create or replace function public.member_profile_rows() returns table (id uuid, nickname text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nickname, p.avatar_url from public.profiles p
  where p.deleted_at is null
    and exists (select 1 from public.room_members m where m.user_id = p.id and public.is_room_member(m.room_id));
$$;
