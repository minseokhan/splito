-- 지출 상세가 그 자리 편집으로 바뀌며(2026-11-24) 쓰지 않게 된 RPC 두 개를 지운다.
-- expense_history(uuid): '수정 내역' 화면 전용이었다. expense_history 테이블은 save_expense가 계속 쓰고
--   lastExpenseChangeAt이 읽으므로 그대로 둔다.
-- set_item_assignees: 상세에서 '누가 먹었는지'만 따로 저장하던 RPC. 이제 save_expense가 품목 지정까지 저장한다.
drop function public.expense_history(uuid);
drop function public.set_item_assignees(uuid, jsonb);
