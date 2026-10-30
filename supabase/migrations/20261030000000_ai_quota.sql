-- AI 호출 한도 원자 차감 (ARCHITECTURE §4 비용 한도). parse-expense가 Claude 호출 전에 사용자 JWT로 호출한다.
-- 증가와 한도 확인을 upsert … returning 한 문장으로 하고, 초과 시 예외로 이 트랜잭션의 증가분을 함께 롤백한다.

create function public.consume_ai_quota(p_room_id uuid, p_global_limit int)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_user int;
  v_room int;
  v_global int;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if not public.is_room_member(p_room_id) then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;

  insert into public.ai_usage (scope, scope_id, day, count) values ('user', auth.uid()::text, v_day, 1)
  on conflict (scope, scope_id, day) do update set count = public.ai_usage.count + 1 returning count into v_user;
  insert into public.ai_usage (scope, scope_id, day, count) values ('room', p_room_id::text, v_day, 1)
  on conflict (scope, scope_id, day) do update set count = public.ai_usage.count + 1 returning count into v_room;
  insert into public.ai_usage (scope, scope_id, day, count) values ('global', '00000000-0000-0000-0000-000000000000', v_day, 1)
  on conflict (scope, scope_id, day) do update set count = public.ai_usage.count + 1 returning count into v_global;

  if v_user > 100 or v_room > 300 or v_global > p_global_limit then
    raise exception using errcode = 'P0001', message = 'AI_QUOTA_EXCEEDED';
  end if;
end;
$$;

revoke execute on function public.consume_ai_quota(uuid, int) from public, anon;
grant execute on function public.consume_ai_quota(uuid, int) to authenticated;
