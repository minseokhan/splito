# Step 2: payout-db

## 읽어야 할 파일

- `/docs/PRD.md` §6 F8.1, §7.3 계좌번호 정책 전체
- `/docs/ARCHITECTURE.md` §3 `payout_accounts`·`payout_reveals`·`room_events`, §4 계좌번호·비밀값, §5.1 `set_payout_account`·`get_payout_account`·`request_payout_account`
- 이전 phase 산출물: `supabase/migrations/*`(특히 `room_balances`), `supabase/tests/*`

## 작업

계좌 암호화 저장·조건부 원문 조회·계좌 요청 RPC를 만든다. pgTAP 먼저.

마이그레이션: `supabase/migrations/<timestamp>_payout.sql`
```sql
set_payout_account(p_bank_code text, p_bank_name text, p_holder_name text, p_account_number text) returns void
get_payout_account(p_room_id uuid, p_owner_member_id uuid)
  returns table(registered boolean, bank_name text, holder_name text, account_masked text, account_number text)  -- account_number는 조건 충족 시만, 아니면 NULL
request_payout_account(p_room_id uuid, p_owner_member_id uuid) returns void
```
규칙
- 공통 RPC 규칙.
- 키: Vault 시크릿 이름 `payout_account_key`(`vault.decrypted_secrets`에서 조회). 마이그레이션은 키를 만들지 않는다. 로컬 테스트용으로 `supabase/seed.sql`에 개발용 키 `vault.create_secret('dev-only-key', 'payout_account_key')`를 넣는다.
- 저장: 숫자·하이픈만, 숫자 8~20자리(`INVALID_INPUT`). `account_enc = pgp_sym_encrypt(원문, key)`, `account_last4`. 본인 행 upsert.
- 마스킹: `account_masked = '****-**-***' || account_last4`(앞자리를 노출하지 않는다).
- 조회 조건: 호출자와 주인이 같은 방 활성 멤버이고, `room_balances(room, false)` 기준 **호출자 net < 0 이고 주인 net > 0**일 때만 원문. 본인 계좌면 항상 원문.
- 원문을 돌려줄 때마다 `payout_reveals` INSERT + `room_events(kind='payout_reveal', target=주인)`. 같은 (viewer, room) 하루 20회 초과 → `RATE_LIMITED`.
- `request_payout_account`: `room_events(kind='payout_request', target=주인)`.

pgTAP `supabase/tests/060_payout.test.sql`: 암호화 저장(평문이 테이블에 없음), 줄 사람만 원문·그 외 마스킹, 본인 조회, reveal 기록·이벤트, 21회째 `RATE_LIMITED`, 비멤버 거부, 직접 SELECT는 본인 행만.

## Acceptance Criteria

```bash
supabase db reset && supabase test db
npm run db:types
npm run lint && npm run build && npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/6-settlement/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 계좌 원문을 평문 컬럼·로그·`room_events.payload`에 남기지 마라. 이유: 안전성 확보조치 기준 §7(PRD §7.3).
- 운영용 암호화 키를 마이그레이션·seed·코드에 넣지 마라. seed의 키는 로컬 개발 전용이다. 이유: CLAUDE.md CRITICAL.
- pgsodium TCE를 쓰지 마라.
