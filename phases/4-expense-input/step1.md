# Step 1: ai-quota-rpc

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §3 `ai_usage`, §4 비용 한도
- 이전 phase 산출물: `supabase/migrations/*_schema.sql`, `supabase/tests/001_schema_rls.test.sql`

## 작업

AI 호출 한도를 원자적으로 차감하는 RPC를 만든다. pgTAP 먼저.

마이그레이션: `supabase/migrations/<timestamp>_ai_quota.sql`
```sql
consume_ai_quota(p_room_id uuid, p_global_limit int) returns void
```
- 공통 RPC 규칙(security definer, `search_path=''`, auth.uid 확인, anon 회수). 호출자는 방 멤버(`FORBIDDEN`).
- `ai_usage`에 (user, uid, 오늘 KST), (room, room_id, 오늘), (global, 고정 UUID `00000000-0000-0000-0000-000000000000`, 오늘)을 각각 `insert … on conflict do update set count = ai_usage.count + 1 returning count`.
- 한도: user 100, room 300, global `p_global_limit`. 하나라도 넘으면 `AI_QUOTA_EXCEEDED`(그 트랜잭션은 롤백되어 카운트도 되돌아간다).
- `p_global_limit`은 Edge Function이 Secrets `AI_DAILY_GLOBAL_LIMIT`을 넘긴다.

pgTAP `supabase/tests/050_ai_quota.test.sql`: 정상 증가, 101번째 user 호출 거부, room 한도, global 한도, 비멤버 거부, 거부 시 카운트 증가 안 함.

## Acceptance Criteria

```bash
supabase db reset && supabase test db
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

- 한도 확인과 증가를 SELECT 후 UPDATE 두 단계로 나누지 마라. 이유: 동시 호출 경합.
- 클라이언트에 `ai_usage` SELECT/쓰기 권한을 주지 마라.
