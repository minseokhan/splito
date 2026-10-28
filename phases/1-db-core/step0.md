# Step 0: schema-rls

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §3 데이터 모델·제약·인덱스 전체, §4 보안 모델 전체, §9 테스트 전략(RLS 행)
- `/docs/ADR.md` ADR-002, ADR-006, ADR-011
- `/docs/PRD.md` §7.3(동의 기록·계좌 암호화·사진)
- 이전 phase 산출물: `package.json`, `.gitignore`

## 작업

Supabase 로컬 프로젝트를 초기화하고 **전체 스키마 + RLS + 권한 회수**를 하나의 마이그레이션으로 만든다. 게스트·공금 기능은 나중 phase지만 **테이블·컬럼은 지금 모두 만든다**(참여자 ID 기반, ADR-011).

1. `supabase init` (이미 있으면 생략). `supabase/config.toml`
   - `[auth.email] enable_signup = false`, `[auth] site_url = "splito://"`, `additional_redirect_urls = ["splito://auth/callback"]`
   - `[auth.external.kakao] enabled = true`, `client_id = "env(SUPABASE_AUTH_KAKAO_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_KAKAO_SECRET)"`
   - `[storage]`는 기본값 유지.
2. `supabase/migrations/<timestamp>_schema.sql`
   - extensions: `pgcrypto`.
   - ARCHITECTURE §3의 모든 테이블: `profiles, payout_accounts, rooms, room_members, room_fx_overrides, expenses, expense_photos, expense_items, expense_scope, item_assignees, expense_history, comments, pool_deposits, transfers, fx_rates, ai_usage, payout_reveals, room_events`.
   - §3 "제약·인덱스" SQL 블록을 그대로 반영한다(복합 FK로 `room_id` 일치 강제, kind 체크, `amount_original > 0`, pending ⇔ krw NULL 등).
   - enum은 `text + check`로 둔다(마이그레이션 변경이 쉽다).
   - `profiles.id → auth.users(id)`에 cascade를 걸지 않는다.
   - 신규 가입 트리거 `public.handle_new_user()`(security definer, `search_path=''`): `auth.users` insert 시 `profiles(id, nickname, avatar_url)` 생성. nickname은 `raw_user_meta_data`의 `nickname`/`name`/`full_name` 중 첫 값을 12자로 자르고, 없으면 빈 문자열.
   - `public.is_room_member(room_id uuid) returns boolean` — security definer, stable, `search_path=''`. 호출자의 `room_members`(kind='user', `left_at is null`)가 있고 `rooms.deleted_at is null`일 때만 true.
   - `public.my_member_id(room_id uuid) returns uuid` — 호출자의 활성 참여자 ID(없으면 NULL). 이후 RPC에서 재사용.
   - 뷰 `public.member_profiles with (security_invoker = true)`: 같은 방 사람의 `id, nickname, avatar_url`만.
3. 권한
   - `revoke insert, update, delete on <ARCHITECTURE §4 장부 테이블 목록> from anon, authenticated;`
   - `fx_rates`, `ai_usage`, `room_events`도 클라이언트 쓰기를 회수한다.
   - 모든 테이블 `enable row level security`.
   - SELECT 정책: 방 하위 테이블은 `is_room_member(room_id)`. `rooms`는 `is_room_member(id)`. `room_members`는 같은 방 멤버. `expenses`는 `deleted_at is null`도 조건. `payout_accounts`는 `user_id = auth.uid()`. `profiles`는 본인만(타인은 `member_profiles`). `fx_rates`는 authenticated 전체. `ai_usage`·`payout_reveals`는 SELECT 정책 없음.
   - `profiles` UPDATE: 본인 행만, 컬럼 권한은 `nickname, terms_version, terms_agreed_at, age14_confirmed_at, overseas_notice_ack_at, marketing_opt_in, marketing_opt_in_at, ai_notice_ack_at`만 `grant update (...)`.
   - `comments`: INSERT는 `author_id = auth.uid() and is_room_member(room_id)`, UPDATE는 본인 행의 `body, deleted_at`만.
4. Storage: `receipts` 버킷(`public=false`, `file_size_limit=5242880`, `allowed_mime_types={image/jpeg}`)과 §4의 `receipts_rw` 정책을 마이그레이션에 넣는다.
5. Realtime: `alter publication supabase_realtime add table expenses, comments, room_members, transfers, pool_deposits, rooms, room_events;`
6. pgTAP 테스트 `supabase/tests/001_schema_rls.test.sql`
   - 사용자 흉내: `insert into auth.users(id, ...)` 후 `set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);`
   - 케이스: 비멤버의 rooms/expenses SELECT 0행 · 멤버 SELECT 가능 · **멤버의 expenses/transfers/room_members 직접 INSERT·UPDATE·DELETE 거부**(`throws_ok`) · 나간 멤버(`left_at` 설정) SELECT 0행 · 삭제된 방 SELECT 0행 · profiles 타인 행 SELECT 0행, `member_profiles`로는 nickname만 · comments 본인 INSERT 성공/타인 명의 INSERT 거부 · 제약 위반(`amount_original <= 0`, KRW인데 fx_source≠'krw', 다른 방 member_id를 expense_scope에 넣기) 거부 · `handle_new_user`로 profile 생성.
   - fixture 데이터는 테스트 안에서 superuser로 직접 INSERT 한다(RPC는 다음 step).

## Acceptance Criteria

```bash
supabase db reset && supabase test db
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

- 클라이언트(`authenticated`)에 장부 테이블 INSERT·UPDATE·DELETE 정책이나 권한을 주지 마라(`comments`, 본인 `profiles` 컬럼 제외). 이유: ADR-002, 검증 우회 방지.
- 원화 컬럼에 `numeric`/`float`을 쓰지 마라. 원화는 `bigint`. 이유: CLAUDE.md CRITICAL.
- 게스트·공금 컬럼을 "나중에 추가"로 미루지 마라. 이유: 스키마를 갈아엎지 않기 위해 처음부터 참여자 ID 구조로 만든다(ADR-011).
- pgsodium TCE를 쓰지 마라. 이유: ARCHITECTURE §4 — 계좌는 pgp_sym_encrypt + Vault 키(6-settlement phase).
- 원격 Supabase 프로젝트에 `supabase db push`/`link` 하지 마라. 이유: 로컬 검증만 한다.
