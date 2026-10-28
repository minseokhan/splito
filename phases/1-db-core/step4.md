# Step 4: transfers-leave

## 읽어야 할 파일

- `/docs/PRD.md` §6 F8, §7.2 확인 상태별 반영, §7.3 방 나가기
- `/docs/ARCHITECTURE.md` §3 transfers, §5.1 `record_transfer`·`confirm_transfer`·`reject_transfer`·`cancel_transfer`·`leave_room`, §9 동시성 행
- `/docs/USER_FLOWS.md` J6, J10
- 이전 step 산출물: `supabase/migrations/*_room_balances.sql`, `supabase/tests/030_room_balances.test.sql`

## 작업

송금 기록 RPC와 방 나가기를 만든다. pgTAP 먼저.

마이그레이션: `supabase/migrations/<timestamp>_transfers_leave.sql`

```sql
record_transfer(p_id uuid, p_room_id uuid, p_from_member_id uuid, p_to_member_id uuid, p_amount_krw bigint) returns void
confirm_transfer(p_id uuid) returns void
reject_transfer(p_id uuid) returns void   -- void_reason='not_received'
cancel_transfer(p_id uuid) returns void   -- void_reason='cancelled'
leave_room(p_room_id uuid) returns void
```

규칙
- 공통 RPC 규칙 + `rooms ... for update`.
- `record_transfer`
  - from·to 모두 이 방의 활성 `kind='user'` 참여자(`MEMBER_LEFT`/`FORBIDDEN`), from ≠ to, amount > 0(`AMOUNT_INVALID`).
  - 호출자가 from이면 미확인 기록, to이면 `confirmed_at = now()`로 바로 확인. 둘 다 아니면 `FORBIDDEN`.
  - 같은 `p_id`가 이미 있으면 아무것도 하지 않는다(멱등).
  - `room_events(kind='transfer')` 1건.
- `confirm_transfer`/`reject_transfer`: to 본인만(`FORBIDDEN`). 이미 무효면 `FORBIDDEN`.
- `cancel_transfer`: from 본인만, `confirmed_at is null`일 때만(`ALREADY_CONFIRMED`).
- `leave_room`: 차단 순서대로 —
  - 호출자가 대표하는 활성 게스트가 있으면 `GUEST_REPRESENTATIVE`
  - 통장 주인이면 `POOL_OWNER`
  - pending 지출이 있으면 `FX_PENDING_EXISTS`
  - `room_balances(room, true)`의 내 net ≠ 0 이면 `BALANCE_NOT_ZERO`
  - 통과: `left_at = now()`, `room_events(kind='leave')`. 방장이면 `joined_at`이 가장 빠른 활성 user에게 `owner_id` 위임 + `room_events(kind='owner_change')`. 마지막 활성 user면 `rooms.deleted_at = now()`.

pgTAP: `supabase/tests/040_transfers_leave.test.sql`
- 보냄 기록 → room_balances(false) 반영, (true) 미반영 → 확인 후 반영
- 받는 사람이 기록 → 즉시 확인 · 같은 id 두 번 → 1건 · 게스트 당사자 → 거부 · 제3자 기록 → `FORBIDDEN`
- reject·cancel 후 net 미반영 · 확인된 건 cancel → `ALREADY_CONFIRMED`
- 정산 후 지출 추가 → 남은 금액만 · 역송금 상황
- leave 4가지 차단 코드 · 정상 나가기 · 방장 위임 · 마지막 멤버 → 방 삭제 · 나간 뒤 join_room으로 재합류

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
3. 결과에 따라 `phases/1-db-core/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 실제 송금(은행·간편결제 API)을 연동하지 마라. 이유: PRD §8 MVP 제외.
- `transfers` 행을 하드 삭제하지 마라. 무효는 `voided_at`·`void_reason`으로. 이유: 기록 보존·Realtime.
- `remove_member`(P1), `delete-account`(P1)를 만들지 마라.
