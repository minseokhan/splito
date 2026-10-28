# Step 1: room-rpcs

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §3(`invite_token` 생성 규칙), §4 RPC 공통 규칙, §5.1 RPC 표의 `create_room`·`preview_invite`·`join_room`·`update_room`·`rotate_invite`
- `/docs/PRD.md` §6 F2, §9 초대 수단
- `/docs/USER_FLOWS.md` J2 분기 A~G
- 이전 step 산출물: `supabase/migrations/*_schema.sql`, `supabase/tests/001_schema_rls.test.sql`

## 작업

방 생성·초대·합류 RPC를 pgTAP 테스트 먼저 작성하고 구현한다.

마이그레이션: `supabase/migrations/<timestamp>_room_rpcs.sql`

```sql
create_room(p_name text, p_base_currency text, p_start_date date default null, p_end_date date default null) returns uuid
preview_invite(p_token text) returns jsonb  -- {room_id, room_name, inviter_nickname, member_count, already_member}
join_room(p_token text) returns uuid
update_room(p_room_id uuid, p_name text, p_base_currency text, p_start_date date, p_end_date date) returns void
rotate_invite(p_room_id uuid) returns text
```

공통 규칙(모든 RPC)
- `security definer`, `set search_path = ''`, 객체는 `public.` 접두사.
- 첫 줄: `if auth.uid() is null then raise exception using errcode='P0001', message='FORBIDDEN'; end if;`
- `revoke execute on function ... from public, anon; grant execute ... to authenticated;`
- 금액·멤버십 쓰기는 `select ... from public.rooms where id = ... for update`로 직렬화.

함수별 규칙
- `create_room`: 이름 1~30자, 통화 `^[A-Z]{3}$`, `start_date <= end_date` 아니면 `INVALID_INPUT`. 방 + 생성자 `room_members(kind='user')` + `owner_id` + `invite_token`(=`translate(encode(extensions.gen_random_bytes(16),'base64'),'+/=','-_')`의 앞 22자, 128비트) 생성.
- `preview_invite`: 토큰이 없거나 방이 삭제됐으면 `INVITE_INVALID`(이유 구분 금지). `inviter_nickname`은 방장 닉네임. `member_count`는 활성 참여자(게스트 포함) 수.
- `join_room`: 이미 활성이면 아무것도 하지 않고 room_id 반환. 예전에 나갔으면(`left_at` 있음) `left_at = null`, `joined_at`은 유지. 새 합류면 INSERT + `room_events(kind='join')`. 토큰 무효는 `INVITE_INVALID`.
- `update_room`: 방장만(`FORBIDDEN`). 활성 지출이 있으면 기본 통화 변경 시 `CURRENCY_LOCKED`.
- `rotate_invite`: 방장만. 새 토큰 발급, 이전 토큰은 즉시 무효.

pgTAP: `supabase/tests/010_room_rpcs.test.sql`
- create_room 후 생성자가 멤버·방장, 토큰 22자 `^[A-Za-z0-9_-]{22}$`
- 잘못된 입력 → `INVALID_INPUT`
- 비로그인 호출 → 실패, `anon` 실행 권한 없음(`has_function_privilege`)
- preview: 유효 토큰 결과 · 무효 토큰/삭제된 방 → `INVITE_INVALID` · 이미 멤버면 `already_member=true`
- join: 신규 합류 + room_event 1건 · 재호출 시 중복 없음 · 나갔다 재합류 시 같은 member id, joined_at 유지
- rotate 후 옛 토큰 `INVITE_INVALID` · 비방장 rotate/update → `FORBIDDEN` · 지출 있는 방 통화 변경 → `CURRENCY_LOCKED`

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

- 6자리 초대 코드나 추측 가능한 토큰을 만들지 마라. 이유: ADR-008, 128비트 토큰만.
- `INVITE_INVALID`의 원인(없음/교체/삭제)을 다른 코드나 메시지로 구분하지 마라. 이유: 방 존재 여부 노출 방지.
- `my_rooms`를 이 step에서 만들지 마라. 이유: `room_balances`가 필요해 step 3에서 만든다.
- 기존 마이그레이션 파일을 수정하지 마라. 새 마이그레이션 파일로 추가한다. 이유: 마이그레이션 이력 보존.
