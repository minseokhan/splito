# Step 0: pool-db

## 읽어야 할 파일

- `/docs/PRD.md` §6 F7 예시 2, §7.2 공금 정책 전체
- `/docs/ARCHITECTURE.md` §3 rooms(pool 컬럼)·pool_deposits, §5.1 `set_pool`·`upsert_pool_deposits`
- `/docs/USER_FLOWS.md` J7
- 이전 phase 산출물: `supabase/migrations/*`(schema, save_expense, room_balances, transfers_leave), `supabase/tests/030_room_balances.test.sql`

## 작업

공금 설정 RPC를 만든다. 공금 계산 엔진은 1-db-core `room_balances`에 이미 있다. pgTAP 먼저.

마이그레이션 `supabase/migrations/<timestamp>_pool.sql`
```sql
set_pool(p_room_id uuid, p_enabled boolean, p_owner_member_id uuid, p_card_last4 text[]) returns void
upsert_pool_deposits(p_room_id uuid, p_rows jsonb) returns void   -- [{member_id, amount_krw}] — 사람별 입금 합계를 이 값으로 맞춘다
```
규칙
- 공통 RPC 규칙 + `rooms ... for update`. 활성 멤버 누구나.
- 켤 때 통장 주인 필수, 활성 `kind='user'`만(`INVALID_INPUT` — 게스트·나간 멤버 불가).
- 끌 때: 공금 결제(`payer_kind='pool'`, 삭제 안 됨)나 입금이 있으면 `POOL_IN_USE`.
- 통장 주인 변경 → `room_events(kind='pool_owner_change', payload {from,to})`.
- 카드 끝자리는 각 `^[0-9]{4}$`, 최대 5개.
- `upsert_pool_deposits`: 공금이 켜져 있어야 한다(`INVALID_PAYER`). amount_krw > 0인 행만 남기고(0은 삭제), 게스트 입금 허용, 활성 참여자만(`MEMBER_LEFT`). `pool_deposits`는 사람당 1행으로 관리한다.

pgTAP `supabase/tests/090_pool.test.sql`: PRD F7 예시 2를 **RPC로만** 구성(set_pool → upsert_pool_deposits → save_expense(pool 결제) → save_expense(A 개인)) → room_balances net 일치, 공금 사용 중 끄기 → `POOL_IN_USE`, 게스트 통장 주인 → 거부, 통장 주인 leave → `POOL_OWNER`, 주인 변경 이벤트.

## Acceptance Criteria

```bash
supabase db reset && supabase test db
npm run db:types
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/10-pool-wallet/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `room_balances`의 공금 상계 규칙을 바꾸지 마라. 이유: 1-db-core 테스트로 고정됐다.
- 공금을 송금 당사자(가상 멤버 행)로 만들지 마라. 이유: PRD §7.2 — 통장 주인에게 상계한다.
