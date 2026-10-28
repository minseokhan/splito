# Step 2: save-expense

## 읽어야 할 파일

- `/docs/PRD.md` §7.1 환율 확정 정책 전체, §7.2 분담 정책(대상 인원 고정, 금액 단위, 최대 잔여 배분), §6 F3·F4·F5
- `/docs/ARCHITECTURE.md` §3(expenses·items·scope·history 컬럼, `save_expense` 검증 항목), §5.1 `save_expense`·`delete_expense`·`reconfirm_pending_fx`·`expense_history`, §6.3, §9 pgTAP 케이스
- `/docs/ADR.md` ADR-006, ADR-009
- 이전 step 산출물: `supabase/migrations/*_schema.sql`, `*_room_rpcs.sql`, `supabase/tests/*`

## 작업

지출 저장의 **서버 정답**을 만든다. pgTAP 먼저 작성 → 구현.

마이그레이션: `supabase/migrations/<timestamp>_save_expense.sql`

```sql
save_expense(p_payload jsonb, p_expected_version int default null) returns jsonb  -- 저장된 지출 {id, version, krw_amount, fx_source, fx_rate, fx_base_date}
delete_expense(p_id uuid, p_expected_version int) returns void
reconfirm_pending_fx(p_room_id uuid) returns int          -- 확정된 건수
expense_history(p_expense_id uuid) returns setof jsonb     -- {id, action, actor_id, actor_nickname, at, snapshot}
-- 내부 헬퍼(execute 권한 회수, 외부 호출 금지)
_lookup_fx(p_currency text, p_date date) returns table(rate numeric, base_date date)
```

payload 형태(클라이언트 `request_id` = 지출 `id`, 클라이언트가 만든 UUID):
```json
{ "id": "uuid", "room_id": "uuid",
  "payer_kind": "member|pool", "payer_member_id": "uuid|null",
  "source": "receipt|card_text|card_image|voice|manual",
  "merchant": "text", "paid_local_date": "YYYY-MM-DD", "paid_local_time": "HH:MM|null",
  "currency": "JPY", "krw_charged": 12345|null, "card_last4": "1234|null", "manual_rate": 9.1234|null,
  "needs_review": false, "ai_result": {},
  "scope_member_ids": ["uuid"],
  "items": [{ "id": "uuid", "position": 0, "name_original": "", "name_ko": "", "quantity": 1,
              "amount_original": 1000, "needs_review": false, "is_adjustment": false,
              "assignee_member_ids": ["uuid"] }],
  "photos": [{ "storage_path": "room/expense/uuid.jpg", "kind": "receipt|capture" }] }
```

핵심 규칙 (위반 금지)
1. 공통 RPC 규칙(security definer, `search_path=''`, auth.uid 확인, anon 회수, `rooms ... for update`).
2. 호출자는 방의 활성 멤버여야 한다(`FORBIDDEN`).
3. 멱등·동시성
   - 같은 `id`가 없으면 생성(version=1, action='create').
   - 같은 `id`가 있고 `p_expected_version is null`이면 기존 결과를 그대로 반환한다(재전송 멱등).
   - `p_expected_version`이 현재 version과 다르면 `VERSION_CONFLICT`. 같으면 갱신(박스·지정·대상·사진은 지우고 다시 넣기), version+1, action='update'.
4. 검증 → 에러 코드
   - Σ items.amount_original ≤ 0 또는 items 0개 → `AMOUNT_INVALID`. `expenses.amount_original` = Σ items.
   - `paid_local_date > (now() at time zone 'Asia/Seoul')::date + 1` → `DATE_IN_FUTURE`.
   - scope 0명 → `SCOPE_EMPTY`.
   - payer·scope·assignee가 이 방의 활성 참여자(`left_at is null`)가 아니면 `MEMBER_LEFT`.
   - `payer_kind='pool'`인데 `rooms.pool_enabled`가 false → `INVALID_PAYER`. `payer_kind='member'`인데 payer_member_id 없음 → `INVALID_PAYER`.
   - 사진 경로는 `^{room_id}/{id}/[0-9a-f-]{36}\.jpg$`이어야 한다(`INVALID_INPUT`).
5. 원화 확정(서버만, `fx_rates` 캐시만 읽는다 — 외부 호출 금지)
   - `currency='KRW'` → rate 1, `fx_source='krw'`, krw = round(amount).
   - `krw_charged` 있음 → `fx_source='card_krw'`, krw = krw_charged.
   - `manual_rate` 있음 → `fx_source='manual'`.
   - `room_fx_overrides`에 (room, currency) 있음 → `manual`.
   - 그 외 `_lookup_fx`: `fx_rates`에서 `base_date <= paid_local_date and base_date >= paid_local_date - 10` 중 가장 최근. 없으면 `fx_source='pending'`, krw·박스 krw 모두 NULL.
   - `krw_amount = round(amount_original * rate)` (numeric `round`는 0.5에서 0으로부터 멀어진다).
   - 확정은 저장 시점에만. 갱신 시 결제일·통화·원본 금액·manual_rate가 바뀌지 않았으면 기존 rate를 유지한다.
6. 박스 원화 최대 잔여 배분 (지출 krw가 있을 때)
   - 각 박스 몫 = krw × item.amount / Σamount (numeric) → `floor` (음수 박스도 floor).
   - 남은 원을 소수부(0 이상 1 미만)가 큰 박스부터 1원씩, 동점이면 `position` 작은 순.
   - Σ 박스 krw = 지출 krw 를 함수 끝에서 assert(어긋나면 예외).
7. 이력: 매 create/update/delete마다 `expense_history`에 지출+박스+지정+대상 전체 `snapshot` jsonb.
8. `delete_expense`: 소프트 삭제(`deleted_at`, `deleted_by`), version 검사, 이력 'delete'.
9. `reconfirm_pending_fx`: 방의 pending 지출을 `_lookup_fx`로 다시 확정, 박스 배분, 이력 'update', version+1.
10. `expense_history`: 같은 방 멤버만. 삭제된 지출도 반환.

pgTAP: `supabase/tests/020_save_expense.test.sql` (fx_rates fixture는 superuser INSERT)
- KRW 저장 · JPY 캐시 적중 · 주말(직전 고시일) · 11일 전만 있음 → pending · pending이면 박스 krw NULL
- x.5 반올림(양수·음수 방향) · 최대 잔여 배분 합 일치 · 동점 시 position 순 · 음수 할인 박스 floor
- 원본 합계 0 → `AMOUNT_INVALID` · 미래 날짜 → `DATE_IN_FUTURE` · scope 0 → `SCOPE_EMPTY` · 나간 멤버 지정 → `MEMBER_LEFT` · 공금 꺼짐 + pool 결제 → `INVALID_PAYER`
- 같은 id 재호출 → 1건만 · 잘못된 expected_version → `VERSION_CONFLICT` · 갱신 시 version+1, 이력 2건
- 비멤버 호출 → `FORBIDDEN` · delete 후 피드 SELECT 0행, `expense_history`로는 조회
- reconfirm: 캐시 추가 후 pending → kexim 확정
- krw_charged → card_krw, manual_rate → manual

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

- `save_expense`에서 HTTP로 환율 API를 호출하지 마라(`http`/`pg_net` 금지). 이유: 캐시만 읽고, 캐시는 `fx-rate` Edge Function이 채운다(ARCHITECTURE §5.1).
- 클라이언트가 보낸 `krw_amount`/박스 원화를 믿지 마라(payload에 있어도 무시). 이유: 서버가 확정한다(ADR-006).
- 부동소수점(`float8`/`real`)으로 금액을 계산하지 마라. `numeric` → `floor`/`round` → `bigint`. 이유: CLAUDE.md CRITICAL.
- 하드 삭제(`delete from expenses`)를 하지 마라. 이유: Realtime DELETE 이벤트는 필터가 안 걸리고 이력이 사라진다.
- `merge_expenses`, `restore_expense`, `add_member_to_expenses`를 만들지 마라. 이유: P1이다.
