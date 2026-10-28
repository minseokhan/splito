# Step 5: expense-form-lib

## 읽어야 할 파일

- `/docs/PRD.md` §6 F4(조정 박스, 할인 박스, 확인 필요), F6, §7.1 결제일 판정, §7.2 대상 인원 고정
- `/docs/USER_FLOWS.md` J3 확인·수정 화면 공통 동작, J4
- `/docs/ARCHITECTURE.md` §5.1 `save_expense`, §5.2 `parse-expense` 응답
- 이전 phase 산출물: `src/types/domain.ts`(`SaveExpensePayload`), `supabase/migrations/*_save_expense.sql`(payload 형태), `src/lib/money.ts`

## 작업

인식 결과 → 작성 중 지출(draft) → `save_expense` payload 변환과 검증을 TDD로 만든다. 테스트 먼저(`src/lib/expenseForm.test.ts`).

`src/lib/expenseForm.ts`
```ts
export type DraftItem = { id: string; position: number; nameOriginal: string; nameKo: string; quantity: number;
  amountOriginal: number; needsReview: boolean; isAdjustment: boolean; assigneeMemberIds: string[] };
export type ExpenseDraft = { id: string; roomId: string; source: ExpenseSource; payerKind: 'member'|'pool'; payerMemberId: string | null;
  merchant: string; paidLocalDate: string; paidLocalTime: string | null; currency: string; krwCharged: number | null; cardLast4: string | null;
  scopeMemberIds: string[]; items: DraftItem[]; photos: { storagePath: string; kind: 'receipt'|'capture' }[]; needsReview: boolean; aiResult: unknown };

export function draftFromParse(parse: ParseResult, ctx: { expenseId: string; roomId: string; source: ExpenseSource; meMemberId: string;
  activeMemberIds: string[]; todayLocal: string; newId: () => string }): ExpenseDraft;
export function emptyDraft(ctx: ...): ExpenseDraft;                         // 직접 입력·음성: 결제일 = 오늘(현지)
export function splitItem(d: ExpenseDraft, itemId: string, newId: () => string): ExpenseDraft;   // 박스 쪼개기(금액 반으로, 소수 3자리 floor, 나머지는 원 박스)
export function addItem(d: ExpenseDraft, newId: () => string): ExpenseDraft;
export function toggleScope(d: ExpenseDraft, memberId: string): ExpenseDraft;  // 최소 1명 유지, 빠진 사람은 모든 박스 assignee에서 제거
export function validateDraft(d: ExpenseDraft, todayKst: string): { ok: true } | { ok: false; code: 'AMOUNT_INVALID'|'SCOPE_EMPTY'|'DATE_IN_FUTURE'|'INVALID_INPUT'; field?: string };
export function toSavePayload(d: ExpenseDraft): SaveExpensePayload;
```
규칙
- 품목 합계 ≠ `total`이면 차액만큼 `isAdjustment: true, nameKo: '기타', needsReview: true` 박스를 마지막에 추가(차액이 음수면 할인 박스).
- `total`만 있고 품목이 없으면 총액 박스 1개.
- confidence 'low' 품목은 `needsReview`. 지출 전체 confidence low·통화 모호·연도 보정 → `draft.needsReview`.
- 기본 대상 인원 = 그 시점 활성 참여자 전원. 기본 결제자 = 나.
- Σ 박스 원본 ≤ 0 → AMOUNT_INVALID. 결제일 > KST 오늘+1 → DATE_IN_FUTURE.

테스트: 조정 박스 양수·음수, 총액 박스, needsReview 전파, toggleScope 최소 1명·assignee 정리, splitItem 합 보존, validate 각 코드, toSavePayload가 서버 payload 키와 일치(스냅샷 대신 키 목록 비교).

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/4-expense-input/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- payload에 `krw_amount`나 박스 원화를 넣지 마라. 이유: 서버가 확정한다.
- 부동소수 덧셈으로 원본 금액 합을 비교하지 마라(소수 3자리 → ×1000 정수로). 이유: 0.1+0.2 문제.
