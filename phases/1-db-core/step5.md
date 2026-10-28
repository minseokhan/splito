# Step 5: db-types

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §2(`src/types/database.ts`, `src/types/domain.ts`), §5.1
- 이전 step 산출물: `supabase/migrations/*.sql` 전체

## 작업

DB 타입을 생성하고 도메인 타입을 정의한다.

1. `supabase gen types typescript --local > src/types/database.ts` (로컬 DB가 떠 있어야 한다: `supabase start`).
2. `src/types/domain.ts`: 앱 전역에서 쓸 좁은 타입만 정의한다.
   ```ts
   export type MemberId = string; export type RoomId = string; export type ExpenseId = string;
   export type Krw = number;                 // 원 단위 정수
   export type RoomStatus = 'settled' | 'settling' | 'shared' | 'solo';
   export type FxSource = 'kexim' | 'card_krw' | 'krw' | 'manual' | 'pending';
   export type ExpenseSource = 'receipt' | 'card_text' | 'card_image' | 'voice' | 'manual';
   export type BalanceRow = { memberId: MemberId; kind: 'user' | 'guest'; representativeMemberId: MemberId | null;
     joinedAt: string; leftAt: string | null; paid: Krw; owed: Krw; net: Krw };
   export type SaveExpensePayload = { /* 1-db-core step2의 payload 형태를 camelCase가 아닌 DB 키 그대로 */ };
   ```
3. `package.json` scripts에 `"db:types": "supabase gen types typescript --local > src/types/database.ts"` 추가.

## Acceptance Criteria

```bash
supabase db reset && npm run db:types
npm run lint && npm run build && npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/1-db-core/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `database.ts`를 손으로 고치지 마라. 이유: 생성 파일이다.
- 서비스 래퍼(`src/services/api.ts`)를 이 step에서 만들지 마라. 이유: 각 기능 phase가 필요한 함수만 추가한다.
