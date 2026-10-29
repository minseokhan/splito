begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

-- auth.uid()는 (select auth.uid())로 감싸 행마다 재평가되지 않게 한다(Supabase lint 0003 auth_rls_initplan).
select is_empty(
  $$ select tablename || '.' || policyname from pg_policies
     where schemaname = 'public'
       and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                          '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\s*\)', '', 'gi') ~ 'auth\.uid\(\)' $$,
  'RLS 정책은 auth.uid()를 (select auth.uid())로 감싼다'
);

select * from finish();
rollback;
