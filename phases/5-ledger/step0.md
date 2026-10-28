# Step 0: feed-lib

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` §1 장부 홈 피드, J5(수정 이력 문구)
- `/docs/UI_GUIDE.md` 상태 화면(피드 날짜 그룹), 카드(지출 카드)
- `/docs/PRD.md` §6 F3, §8(여행 기간 밖은 "여행 전" 묶음)
- `/docs/ARCHITECTURE.md` §3 `expense_history.snapshot`
- 이전 phase 산출물: `src/lib/money.ts`, `src/types/domain.ts`, `supabase/migrations/*_save_expense.sql`(snapshot 형태)

## 작업

피드 그룹핑과 이력 요약을 TDD로 만든다. 테스트 먼저.

1. `src/lib/feed.ts` (+ test)
   ```ts
   export type FeedSection<T> = { key: string; title: string; data: T[] };
   // 방 시작일 이전 결제는 맨 아래 "여행 전" 섹션. 나머지는 결제일 내림차순, 같은 날은 created_at 내림차순.
   export function groupFeed<T extends { paidLocalDate: string; createdAt: string }>(rows: T[], roomStartDate: string | null): FeedSection<T>[];
   export function dateTitle(isoDate: string): string;           // "10월 21일 (화)"
   export function payerRecorderLabel(payer: string, recorder: string): string;   // 같으면 "민지 결제", 다르면 "민지 결제 · 지훈 기록"
   ```
2. `src/lib/history.ts` (+ test)
   ```ts
   // 연속한 두 snapshot을 비교해 사람이 읽는 변경 목록. 금액·결제일·통화·가맹점·결제자·대상 인원·박스 추가/삭제/금액·지정 변경.
   export function diffSnapshots(prev: Snapshot | null, next: Snapshot, names: Record<string, string>): string[];
   // 예: ["금액 ¥3,000 → ¥3,280", "대상 인원에서 지훈 제외"]
   ```

테스트: "여행 전" 경계(시작일 당일은 여행 중), 시작일 null, 같은 날 정렬, 요일 표기, diff 각 항목, create(prev=null) → ["처음 기록"], delete → ["삭제"].

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
3. 결과에 따라 `phases/5-ledger/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 여행 기간 밖 지출을 숨기거나 막지 마라. 이유: PRD §8 — 표시·정렬용이다.
- 날짜 라이브러리(dayjs, date-fns)를 추가하지 마라. 이유: ISO 문자열 + `Intl`로 충분하다.
