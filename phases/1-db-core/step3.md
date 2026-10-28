# Step 3: room-balances

## 읽어야 할 파일

- `/docs/PRD.md` §6 F7 수용 기준(예시 2개), §7.2 정산 정책 전체(자투리·공금·게스트·확인 상태)
- `/docs/ARCHITECTURE.md` §5.1 `room_balances`·`my_rooms` 행, §6.5, §9 pgTAP 필수 케이스
- `/docs/USER_FLOWS.md` §5 상태 모델(방 상태 판정 순서)
- `/docs/ADR.md` ADR-007, ADR-011
- 이전 step 산출물: `supabase/migrations/*_save_expense.sql`, `supabase/tests/020_save_expense.test.sql`

## 작업

**순잔액의 유일한 정답** `room_balances`와 방 목록 `my_rooms`를 만든다. 공금 계산 엔진(F7.3a)과 게스트 합산도 여기서 완성한다(화면은 나중 phase). pgTAP 먼저.

마이그레이션: `supabase/migrations/<timestamp>_room_balances.sql`

```sql
room_balances(p_room_id uuid, p_confirmed_only boolean default false)
  returns table(member_id uuid, kind text, representative_member_id uuid, joined_at timestamptz,
                left_at timestamptz, paid bigint, owed bigint, net bigint, fx_pending_count int)
my_rooms() returns table(room_id uuid, name text, base_currency text, start_date date, end_date date,
                         status text,  -- 'settled'|'settling'|'shared'|'solo'
                         member_count int, total_krw bigint, my_net bigint)
```

계산 규칙 (PRD §7.2 그대로)
- 대상: 활성 지출(`deleted_at is null`) 중 `fx_source <> 'pending'`. pending 건수는 `fx_pending_count`.
- 박스 분담: 실제 지정 인원 = `item_assignees ∩ expense_scope`. 비면 scope 전체. 1인 몫 = `floor(box_krw / n)`(SQL에서 floor 명시 — bigint `/`는 0 쪽 버림이라 음수에서 다르다). 자투리 = box_krw − 몫×n (항상 ≥ 0).
- 자투리는 결제자의 owed에 더한다(결제자가 지정 밖이어도). 결제자가 공금이면 통장 주인(`rooms.pool_owner_member_id`).
- paid = 결제(payer_kind='member') krw + 공금 입금 + 보낸 송금. owed = 분담 + 자투리 + 받은 송금.
- 공금: 남은 공금 = Σ입금 − Σ공금결제 krw. 통장 주인 owed += 남은 공금(음수면 그만큼 받을 돈). 공금 행은 반환하지 않는다.
- 송금: `voided_at is null`인 것. `p_confirmed_only`면 `confirmed_at is not null`만.
- 게스트: 게스트 행은 자기 paid·owed를 그대로 반환하되 `net = 0`. 게스트의 (paid − owed)는 **현재** 대표자의 net에 더한다.
- user 행 net = paid − owed (+ 대표하는 게스트들의 paid − owed).
- 나간·탈퇴 멤버 행도 반환한다. 호출자는 그 방 멤버여야 한다(`FORBIDDEN`).
- 불변식: Σ net = 0 (공금 상계 포함). 함수 안에서 assert.

`my_rooms` 상태 판정 (USER_FLOWS §5 순서대로)
1. `settled`: 참여자(게스트 포함) 2명 이상 ∧ 활성 지출 1건 이상 ∧ `room_balances(id, true)` 전원 net 0 ∧ pending 0
2. `settling`: 무효 아닌 송금 1건 이상
3. `shared`: 참여자 2명 이상
4. `solo`: 그 외
- `my_net`은 `room_balances(id, false)`의 내 net. 내 활성 방만, 삭제된 방 제외.

pgTAP: `supabase/tests/030_room_balances.test.sql` — ARCHITECTURE §9의 `room_balances` 필수 케이스 **전부**:
- PRD F7 예시 1: A 60만·B 40만·C 20만·D 0 → net A +30만, B +10만, C −10만, D −30만
- PRD F7 예시 2: 4명 20만씩 입금, 공금 카드 70만, A 개인 12만, 통장 주인 B → net A +11.5만, B −10.5만, C −0.5만, D −0.5만
- 자투리가 결제자에게(결제자가 지정 밖일 때 포함) · 음수 할인 박스 floor · 공금 남음/부족 부호
- 합류·나가기 후 기존 지출 분담 불변 · 송금 반영과 역송금 · confirmed_only 차이 · 1명 방 · pending 제외·카운트
- 게스트 몫이 대표자 net에 합산되고 게스트 net=0 · 게스트 결제자 · 게스트 공금 입금 · 대표자 변경 시 귀속 이동
- Σ net = 0
- my_rooms 4가지 상태 판정

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

- 정산 결과(송금안·순잔액)를 테이블에 저장하지 마라. 이유: ADR-007, 매번 다시 계산한다.
- 송금 매칭(누가 누구에게)을 SQL에 만들지 마라. 이유: 매칭은 클라이언트 `lib/matching`(6-settlement)이 한다.
- `round`로 분담을 나누지 마라. 나눗셈은 floor. 이유: CLAUDE.md CRITICAL.
- 기존 마이그레이션 파일을 수정하지 마라.
