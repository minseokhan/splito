# Step 0: guest-db

## 읽어야 할 파일

- `/docs/PRD.md` §6 F2 게스트 항목, §7.2 게스트 정책
- `/docs/ARCHITECTURE.md` §3 room_members(게스트 컬럼·체크), 게스트 규칙, §5.1 `add_guest`·`update_guest`·`remove_guest`
- `/docs/ADR.md` ADR-011
- `/docs/USER_FLOWS.md` J9
- 이전 phase 산출물: `supabase/migrations/*`(schema, room_balances, transfers_leave), `supabase/tests/030_room_balances.test.sql`

## 작업

게스트 RPC를 만든다. 스키마·정산 합산은 1-db-core에서 이미 끝났다. pgTAP 먼저.

마이그레이션 `supabase/migrations/<timestamp>_guest.sql`
```sql
add_guest(p_room_id uuid, p_name text, p_representative_member_id uuid default null) returns uuid
update_guest(p_member_id uuid, p_name text default null, p_representative_member_id uuid default null) returns void
remove_guest(p_member_id uuid) returns void
```
규칙
- 공통 RPC 규칙 + `rooms ... for update`. 누구나(활성 멤버) 호출 가능.
- 이름 trim 1~12자(`INVALID_INPUT`). 대표자 기본값 = 호출자의 참여자 ID.
- 대표자는 같은 방의 활성 `kind='user'` 참여자(`MEMBER_LEFT`/`INVALID_INPUT`).
- `add_guest` → `room_events(kind='guest_added')`. 대표자 변경 → `room_events(kind='guest_rep_change', payload {from,to})`.
- `remove_guest`: 결제자·대상 인원·박스 지정·공금 입금 어디에도 참조가 없을 때만 삭제(이 경우만 하드 삭제 허용 — 장부 참조가 없으므로). 참조가 있으면 `GUEST_IN_USE`.
- `kind='user'` 행을 이 RPC들로 바꿀 수 없다(`FORBIDDEN`).

pgTAP `supabase/tests/080_guest.test.sql`: 추가·기본 대표자, 이름 경계, 나간 멤버를 대표자로 → 거부, 대표자 변경 시 `room_balances` 귀속 이동, 참조 있는 게스트 삭제 → `GUEST_IN_USE`, 미참조 삭제 성공, 대표자의 leave → `GUEST_REPRESENTATIVE`, 게스트를 송금 당사자로 → 거부(기존 검증 재확인).

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
3. 결과에 따라 `phases/9-guest/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 게스트를 가입 계정으로 전환하는 기능을 만들지 마라. 이유: PRD §8 제외.
- `room_balances`의 게스트 합산 규칙을 바꾸지 마라. 이유: 1-db-core에서 테스트로 고정됐다.
- 게스트에게 송금 카드를 직접 주는 방식을 만들지 마라. 이유: ADR-011.
