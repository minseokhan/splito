# 아키텍처

> 결정 이유는 `ADR.md`, 화면 흐름은 `USER_FLOWS.md`, 정책(환율·정산·개인정보)은 `PRD.md` §7을 따른다. 이 문서와 PRD가 충돌하면 PRD 정책이 우선이다.

## 1. 기술 스택
| 영역 | 선택 | 비고 |
|------|------|------|
| 앱 | **Expo SDK 57 (고정)** + React Native New Architecture + **TypeScript strict** | SDK 58(2026-10-15)은 0단계 스파이크에서 NativeWind·speech-recognition 호환을 확인한 뒤에만 올린다 |
| 라우팅 | **Expo Router** (파일 기반) | Next.js App Router와 비슷하다. 딥링크가 라우트에 자동으로 매핑된다 |
| 빌드·배포 | **EAS Build / Submit / Update** | 네이티브 모듈 때문에 Expo Go 대신 **Development Build**를 쓴다 |
| 스타일 | **NativeWind 4.x** (Tailwind 3) | v5는 RC라 쓰지 않는다. 토큰은 `tailwind.config.js`(UI_GUIDE와 1:1) |
| 서버 상태 | **TanStack Query v5** | Realtime 이벤트로 쿼리를 무효화한다 |
| 클라이언트 상태 | React state + Context (세션, 대기 중인 초대, 작성 중 지출) | 전역 상태 라이브러리는 쓰지 않는다 |
| 폼·검증 | react-hook-form + **zod** | 앱과 Edge Function에 스키마를 **각각** 두고, 고정 테스트 데이터(fixture)로 둘의 일치를 테스트한다(Metro와 Deno의 import 방식이 서로 맞지 않는다) |
| 백엔드 | **Supabase**: Postgres(RLS·RPC), Auth, Realtime, Storage, Edge Functions(Deno), Vault | 별도 서버 없음. 리전 **ap-northeast-2(서울)** |
| AI | **Claude API `claude-sonnet-5`** | Edge Function에서만 호출한다. JSON schema 구조화 출력만 쓰고 tool_choice 강제는 쓰지 않는다. `temperature` 같은 샘플링 파라미터는 넣지 않는다(400 에러). effort `low`, `max_tokens` 4096. 모델 ID는 Secrets `CLAUDE_MODEL`에 둔다 |
| 음성 인식 | **expo-speech-recognition** (SDK 버전에 맞춘 버전, iOS 16.4 이상) | 기기 내장 STT, ko-KR |
| 환율 | 한국수출입은행 Open API **`oapi.koreaexim.go.kr`** → Edge Function → `fx_rates` 캐시 | 예전 도메인은 2026-04-30에 종료됐다 |
| 이미지 | expo-image-picker(`exif:false`) → expo-image-manipulator(긴 변 1600px, JPEG 0.8로 다시 인코딩) | EXIF·GPS를 제거하고 용량과 AI 비용을 줄인다 |
| 공유·QR | React Native `Share`(OS 공유 시트), react-native-qrcode-svg | 카카오 공유 SDK(@react-native-kakao/share)는 P1 |
| 클립보드 | expo-clipboard | iOS 초대 복원에는 `ClipboardPasteButton`(iOS 16 이상, 권한 팝업 없음)을 쓴다 |
| 인증 저장 | **LargeSecureStore 패턴** | AES 키는 expo-secure-store에 두고, 암호화한 세션은 AsyncStorage에 둔다(SecureStore는 값당 약 2KB 제한) |
| 웹 | **Vercel** 정적 사이트 `web/` | `/i/:token` 랜딩, `/.well-known/*`, `/terms`, `/privacy` |
| 테스트 | jest(jest-expo) + @testing-library/react-native, pgTAP(`supabase test db`), Deno test | |
| 모니터링 | Sentry(P1) | 요청 본문·계좌·토큰은 수집하지 않는다 |

## 2. 디렉토리 구조
```
splito/
├── app/                              # Expo Router 화면. 로직 없이 hooks·lib·components를 조합만 한다
│   ├── _layout.tsx                   # Provider(QueryClient, Auth), 폰트, 딥링크 처리
│   ├── +native-intent.tsx            # 외부 진입 URL 허용 목록: /i/*, /auth/callback 외는 홈으로
│   ├── (auth)/login.tsx · consent.tsx · profile-setup.tsx
│   ├── (app)/
│   │   ├── _layout.tsx               # 인증 가드
│   │   ├── index.tsx                 # 내 여행 목록
│   │   ├── me.tsx                    # 내 정보(닉네임·계좌·로그아웃·탈퇴)
│   │   └── rooms/
│   │       ├── new.tsx
│   │       └── [roomId]/
│   │           ├── _layout.tsx       # 방 단위 Realtime 구독
│   │           ├── index.tsx         # 장부 홈(피드)
│   │           ├── expenses/new.tsx  # 입력 방식 + 입력
│   │           ├── expenses/review.tsx
│   │           ├── expenses/[expenseId].tsx
│   │           ├── settle.tsx · invite.tsx · pool.tsx · settings.tsx · members.tsx
│   ├── i/[token].tsx                 # 초대 링크 진입
│   └── auth/callback.tsx             # OAuth 리다이렉트(PKCE 코드 교환)
├── src/
│   ├── components/                   # 표시 전용 UI
│   ├── hooks/                        # useRoom, useFeed, useRealtimeRoom, useDraft …
│   ├── lib/                          # 순수 로직 — TDD 필수
│   │   ├── money.ts                  # 정수 원 연산, 최대 잔여 배분(미리보기), 금액 표기
│   │   ├── matching.ts               # 순잔액 → 그리디 송금안(결정적 정렬)
│   │   ├── duplicate.ts              # 중복 후보 점수
│   │   ├── invite.ts                 # 초대 URL·토큰 파싱·검증
│   │   └── errors.ts                 # 서버 에러 코드 → 사용자 메시지
│   ├── services/                     # 외부 호출 래퍼(모킹 비용이 커서 TDD 예외)
│   │   ├── supabase.ts               # flowType 'pkce', detectSessionInUrl false, LargeSecureStore
│   │   ├── api.ts                    # RPC·Edge Function 타입 래퍼
│   │   ├── storage.ts                # 업로드·서명 URL
│   │   └── drafts.ts                 # 작성 중·오프라인 지출 로컬 보관
│   ├── types/database.ts             # `supabase gen types typescript`로 생성
│   ├── types/domain.ts
│   └── theme/tokens.ts
├── supabase/
│   ├── migrations/                   # 스키마·RLS·RPC
│   ├── functions/
│   │   ├── _shared/                  # 인증 헬퍼, 에러 포맷, zod 스키마(Deno용)
│   │   ├── parse-expense/
│   │   ├── fx-rate/
│   │   └── delete-account/
│   ├── tests/                        # pgTAP: RLS, 정산(room_balances) fixture
│   └── seed.sql
├── web/                              # Vercel 정적
│   ├── i/index.html                  # 초대 랜딩(방 정보 조회 없음, 고정 문구)
│   ├── .well-known/apple-app-site-association · assetlinks.json
│   ├── terms.html · privacy.html
│   └── vercel.json                   # rewrite + 보안 헤더
├── app.config.ts                     # scheme 'splito', associatedDomains, intentFilters, plugins
└── eas.json
```

## 3. 데이터 모델 (Postgres)
**금액 규칙**
- 원화는 `bigint`(원 단위 정수)로 저장한다.
- 외화 원본은 `numeric(18,3)`(KWD 같은 소수 3자리 통화 대응), 환율은 `numeric(18,6)`(1단위 통화당 원)으로 저장한다.

**공통 규칙**
- 모든 테이블에 `created_at timestamptz default now()`를 둔다.
- 방 하위 테이블은 RLS와 Realtime 필터를 위해 `room_id`를 비정규화한다. 이 값은 **복합 FK로 부모와 일치하도록 강제한다.**
- **장부에서 사람을 가리킬 때는 모두 참여자 ID(`room_members.id`)를 쓴다.** 참여자는 가입 멤버(`user_id` 있음)와 게스트(`user_id` 없음, 대표자 지정)로 나뉜다.
  - 결제자, 대상 인원, 박스 지정, 공금 입금, 송금, 통장 주인이 모두 참여자 ID를 참조한다.
  - 계정을 가리키는 컬럼(`created_by`, `actor_id`, `author_id` 등)만 `profiles(id)`를 참조한다.
  - `profiles.id → auth.users(id)`에는 cascade를 걸지 않는다(탈퇴해도 장부가 남아야 한다).

```
profiles          id PK(=auth.users.id), nickname, avatar_url,
                  terms_version, terms_agreed_at, age14_confirmed_at, overseas_notice_ack_at,
                  marketing_opt_in bool, marketing_opt_in_at, ai_notice_ack_at, deleted_at
payout_accounts   user_id PK → profiles, bank_code, bank_name, holder_name,
                  account_enc bytea, account_last4 char(4), updated_at        -- 원문 암호화
rooms             id PK, name, base_currency char(3), start_date, end_date, owner_id → profiles,
                  invite_token text UNIQUE, pool_enabled bool, pool_owner_member_id NULL, pool_card_last4 text[],
                  deleted_at
room_members      id PK, room_id, kind('user'|'guest'),
                  user_id NULL → profiles            -- kind='user'일 때만, unique(room_id, user_id)
                  guest_name text NULL               -- kind='guest'일 때만(1~12자)
                  representative_member_id NULL      -- kind='guest'일 때만, 같은 방의 활성 user 참여자
                  joined_at(최초 합류·추가 시각, 재합류 시 유지), left_at, removed_by, created_by
room_fx_overrides (room_id, currency) PK, rate numeric(18,6), set_by, set_at    -- 미고시 통화 수동 환율
expenses          id PK(클라이언트 UUID), room_id, created_by, updated_by,
                  payer_kind('member'|'pool'), payer_member_id NULL,   -- 게스트도 결제자가 될 수 있다
                  source('receipt'|'card_text'|'card_image'|'voice'|'manual'),
                  merchant, paid_local_date date, paid_local_time time NULL,
                  currency char(3), amount_original numeric(18,3),
                  krw_amount bigint NULL, fx_rate numeric(18,6) NULL, fx_base_date date NULL,
                  fx_source('kexim'|'card_krw'|'krw'|'manual'|'pending'),
                  krw_charged bigint NULL, card_last4 char(4) NULL,
                  needs_review bool, ai_result jsonb, version int default 1, deleted_at, deleted_by
expense_photos    id PK, expense_id, room_id, storage_path UNIQUE, kind('receipt'|'capture')
expense_items     id PK, expense_id, room_id, position int, name_original, name_ko,
                  quantity numeric(10,3), amount_original numeric(18,3), krw_amount bigint NULL(지출이 pending이면 전부 NULL),
                  needs_review bool, is_adjustment bool
expense_scope     (expense_id, member_id) PK, room_id   -- 대상 인원(게스트 포함). 저장 시 항상 1명 이상 명시
item_assignees    (item_id, member_id) PK, room_id      -- 없으면 대상 인원 전원
expense_history   id PK, expense_id, room_id, actor_id, action('create'|'update'|'delete'|'restore'|'merge'|'scope_add'),
                  snapshot jsonb(지출+박스+지정+대상 인원 전체), at
comments          id PK, expense_id, room_id, author_id, body text check(length ≤ 500), deleted_at
pool_deposits     id PK, room_id, member_id, amount_krw bigint check(> 0), created_by   -- 게스트 입금 허용
transfers         id PK(클라이언트 UUID), room_id, from_member_id, to_member_id, amount_krw bigint check(> 0),
                  recorded_by, confirmed_at, voided_at, voided_by, void_reason('cancelled'|'not_received')
                  -- 송금 당사자는 kind='user' 참여자만(게스트 몫은 대표자에게 합산되므로)
fx_rates          (base_date, currency) PK, rate numeric(18,6), fetched_at       -- 하루치 전 통화를 한 번에
ai_usage          (scope('user'|'room'|'global'), scope_id, day) PK, count int   -- 호출 한도
payout_reveals    id PK, room_id, viewer_id, owner_id, at                         -- 계좌 원문 조회 기록
room_events       id PK, room_id, kind('join'|'leave'|'removed'|'guest_added'|'guest_rep_change'|'owner_change'|
                  'pool_owner_change'|'payout_reveal'|'payout_request'|'transfer'), actor_id, target_member_id NULL, payload jsonb
                  -- 방 활동 시스템 메시지. 해당 RPC 안에서만 INSERT(해커톤 포함)
```

**제약·인덱스** (마이그레이션에 포함)
```sql
alter table room_members add unique (id, room_id),
  add check ((kind = 'user') = (user_id is not null)),
  add check ((kind = 'guest') = (guest_name is not null and representative_member_id is not null)),
  add foreign key (representative_member_id, room_id) references room_members(id, room_id);
create unique index on room_members (room_id, user_id) where user_id is not null;
alter table expenses add unique (id, room_id),
  add foreign key (payer_member_id, room_id) references room_members(id, room_id),
  add check ((payer_kind = 'member') = (payer_member_id is not null)),
  add check ((fx_source = 'pending') = (krw_amount is null)),
  add check (currency <> 'KRW' or fx_source = 'krw'),
  add check (amount_original > 0);
alter table expense_items add unique (id, room_id),
  add foreign key (expense_id, room_id) references expenses(id, room_id) on delete cascade;
alter table expense_photos add foreign key (expense_id, room_id) references expenses(id, room_id) on delete cascade;
alter table expense_scope add foreign key (expense_id, room_id) references expenses(id, room_id) on delete cascade,
  add foreign key (member_id, room_id) references room_members(id, room_id);
alter table item_assignees add foreign key (item_id, room_id) references expense_items(id, room_id) on delete cascade,
  add foreign key (member_id, room_id) references room_members(id, room_id);
alter table pool_deposits add foreign key (member_id, room_id) references room_members(id, room_id);
alter table rooms add foreign key (pool_owner_member_id) references room_members(id);
alter table transfers
  add foreign key (from_member_id, room_id) references room_members(id, room_id),
  add foreign key (to_member_id, room_id) references room_members(id, room_id),
  add check (from_member_id <> to_member_id);
create index on expenses (room_id, paid_local_date desc, created_at desc) where deleted_at is null;
create index on expense_items (expense_id);
create index on comments (expense_id);
create index on transfers (room_id);
create index on pool_deposits (room_id);
create index on room_members (user_id) where left_at is null;
```
- `expenses.amount_original` = Σ 박스 `amount_original`(조정 박스 포함).
- `save_expense` 안에서 검증할 것: 박스 원화 합계가 지출 원화와 같은지, 대상 인원이 1명 이상인지, 결제자·지정 인원·대상 인원이 활성 참여자인지.
- **게스트 규칙**(RPC에서 검증)
  - 대표자는 같은 방의 활성 `user` 참여자여야 한다.
  - 게스트는 통장 주인·방장·송금 당사자가 될 수 없다.
  - 대표자가 나가려면 먼저 게스트를 다른 멤버에게 넘겨야 한다(`GUEST_REPRESENTATIVE`).
  - 장부에서 참조되는 게스트는 삭제할 수 없고, 이름 변경과 대표자 변경만 가능하다.
- `invite_token` = `encode(gen_random_bytes(16), 'base64')`를 URL-safe로 바꾼 값(22자, 128비트)이다.

## 4. 보안 모델
- **쓰기는 RPC로만 한다.** 장부 테이블(`rooms, room_members, expenses, expense_items, expense_scope, item_assignees, expense_photos, expense_history, transfers, pool_deposits, payout_accounts, payout_reveals, room_fx_overrides`)에서 `authenticated`·`anon`의 INSERT·UPDATE·DELETE 권한을 회수한다. 쓰기는 `security definer` RPC로만 한다.
  - 예외: `comments`(본인 작성·본인 소프트 삭제), `profiles`(본인 행의 닉네임·동의 컬럼).
  ```sql
  revoke insert, update, delete on <위 테이블들> from anon, authenticated;
  ```
- **RPC 공통 규칙**
  - 모든 `security definer` 함수는 `set search_path = ''`로 고정하고, 객체에 스키마를 붙인다(`public.rooms`).
  - 첫 줄에서 `auth.uid() is null`이면 거부한다.
  - `revoke execute ... from anon`을 건다.
  - 같은 방의 금액·멤버십 쓰기는 `select ... from public.rooms where id = $1 for update`로 직렬화한다.
- **읽기 RLS**: `is_room_member(room_id)`로 판정한다(`security definer`, `stable`, `search_path=''`). 이 함수는 `left_at is null`이고 `rooms.deleted_at is null`일 때만 참이다.
  - 지출·박스·사진·이력·댓글·송금·공금: 같은 방 멤버만 SELECT할 수 있다. 소프트 삭제된 지출은 이력 화면에서만 RPC로 조회한다.
  - `profiles`: 본인은 전체 컬럼을 본다. 같은 방 사람은 뷰 `member_profiles`(`with (security_invoker = true)`, `nickname`·`avatar_url`만)로 본다.
  - `payout_accounts`: 직접 SELECT는 본인만 할 수 있다.
  - `fx_rates`: 인증된 사용자 누구나 읽는다.
- **계좌번호**
  - 저장: `set_payout_account` RPC가 Vault의 키로 `pgp_sym_encrypt`해서 저장한다(pgsodium TCE는 쓰지 않는다).
  - 조회: `get_payout_account(room_id, owner_member_id)`는 같은 방 멤버이고 `room_balances` 기준(게스트 합산 후)으로 **조회자 잔액 < 0, 계좌 주인 잔액 > 0**일 때만 원문을 돌려준다. 그 외에는 마스킹한 값만 준다.
  - 원문 조회는 `payout_reveals`에 기록하고 방 활동에 "OO님이 정산을 위해 계좌를 확인했어요"로 표시한다. 한도는 사용자당 방별 하루 20회다.
- **Storage**
  - `receipts` 버킷은 `public=false`, `file_size_limit=5MB`, `allowed_mime_types={image/jpeg}`로 둔다.
  - 경로는 `{room_id}/{expense_id}/{uuid}.jpg`다.
  ```sql
  create policy receipts_rw on storage.objects for all to authenticated
    using (bucket_id='receipts' and public.is_room_member(((storage.foldername(name))[1])::uuid))
    with check (bucket_id='receipts' and public.is_room_member(((storage.foldername(name))[1])::uuid));
  ```
  - 열람은 서명 URL(10분)로만 한다.
  - Storage 파일은 SQL cascade로 지워지지 않는다. 방 삭제·보관 만료·고아 파일 정리는 Storage API를 쓰는 정리 작업으로 처리한다(P1).
- **Edge Function**
  - 모두 사용자 JWT를 검증한다.
  - `parse-expense`는 Storage를 **사용자 JWT 클라이언트로** 읽는다(Storage RLS가 그대로 적용된다).
  - `storage_path`는 `^{room_id}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$` 형식이어야 한다.
  - `text`는 4,000자 이하로 받는다.
  - service role 키는 `fx-rate`(캐시 쓰기)와 `delete-account`에서만 쓴다.
  - 요청 본문·AI 원문·문자 원문은 로그에 남기지 않는다. 에러 로그는 `code`와 `room_id`만 남긴다.
- **비용 한도**: `ai_usage`로 사용자당 하루 100회, 방당 하루 300회, 전체 하루 Secrets `AI_DAILY_GLOBAL_LIMIT`회로 제한한다(`insert … on conflict do update set count = count + 1 returning count`로 원자적으로 증가). 한도를 넘으면 직접 입력만 허용한다.
- **비밀값**
  - Supabase Secrets에 둔다: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `KEXIM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Vault 계좌 암호화 키.
  - 앱 번들에는 `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_ANON_KEY`만 넣는다.
- **Auth 설정**
  - Email provider와 이메일 가입을 끈다.
  - Redirect URL 허용 목록은 정확히 일치하는 값만 넣는다(`splito://auth/callback`). 와일드카드는 쓰지 않는다.
- **딥링크**: `+native-intent`에서 `/i/{token}`(토큰 정규식 `^[A-Za-z0-9_-]{22}$`)과 `/auth/callback`만 받는다. Install Referrer와 클립보드에서 들어온 값도 같은 정규식으로 검증한다.
- **AI 프롬프트 인젝션**
  - 영수증·문자 텍스트는 데이터로만 다룬다. 출력은 JSON schema로 강제하고 zod로 다시 검증한다.
  - 문자열 길이를 제한한다(품목명 80자). URL·계좌번호 패턴이 보이면 '확인 필요'를 붙인다.
  - 모델 출력으로 권한이나 쿼리를 결정하지 않는다.
- **웹 랜딩**
  - 방 정보를 조회하지 않는다. 고정 문구 "스플리토 여행에 초대받았어요"만 보여준다. 그래서 XSS·anon API가 필요 없다.
  - `vercel.json` 헤더:
    - `Content-Security-Policy: default-src 'self'; script-src 'self'; frame-ancestors 'none'`
    - `Referrer-Policy: no-referrer`
  - `/i/*`에는 서드파티 분석 스크립트를 넣지 않는다.

## 5. 서버 인터페이스
에러 규약: RPC는 `raise exception using errcode = 'P0001', message = '<CODE>'`로 실패를 알린다. 클라이언트 `src/lib/errors.ts`가 코드를 사용자 메시지로 바꾼다(§8 표).

### 5.1 RPC
| 함수 | 동작 | 주요 에러 |
|------|------|----------|
| `create_room(name, base_currency, start_date?, end_date?)` | 방 생성 + 생성자를 멤버로 추가 + 토큰 발급 → room_id | `INVALID_INPUT` |
| `preview_invite(token)` | `{room_name, inviter_nickname, member_count, already_member}`. 인증 사용자만, 합류 확인 시트에서 쓴다 | `INVITE_INVALID` |
| `join_room(token)` | 멤버로 추가. 이미 활성 멤버면 아무것도 하지 않는다. `left_at`이 있으면 NULL로 되돌린다 → room_id | `INVITE_INVALID`(없음·교체·삭제된 방 모두 같은 코드) |
| `my_rooms()` | 방 목록 + 상태 + 내 순잔액 | |
| `update_room(room_id, …)` | 방장만 호출. 지출이 있으면 기본 통화를 바꿀 수 없다 | `FORBIDDEN`, `CURRENCY_LOCKED` |
| `rotate_invite(room_id)` | 방장만 호출. 새 토큰을 발급하고 이전 토큰을 무효화한다 | `FORBIDDEN` |
| `remove_member(room_id, member_id)` (P1) | 방장만 호출. 순잔액이 0이 아니면 경고 플래그를 반환하고, 내보낸 뒤 토큰을 자동 재발급한다 | `FORBIDDEN` |
| `add_guest(room_id, name, representative_member_id?)` / `update_guest(member_id, name?, representative_member_id?)` | 게스트 추가(대표자 기본값은 호출자) / 이름·대표자 변경 + room_event. 누구나 호출 가능 | `INVALID_INPUT`, `MEMBER_LEFT` |
| `remove_guest(member_id)` | 장부에서 참조되지 않는 게스트만 삭제 | `GUEST_IN_USE` |
| `leave_room(room_id)` | 확인된 송금 기준 잔액 0(대표하는 게스트 합산 포함), 환율 대기 없음, 통장 주인 아님, 대표하는 게스트 없음 → 탈퇴. 방장이면 가장 먼저 합류한 활성 멤버에게 위임한다. 마지막 활성 멤버면 `rooms.deleted_at = now()`(사진 삭제는 P1 정리 작업) | `BALANCE_NOT_ZERO`, `FX_PENDING_EXISTS`, `POOL_OWNER`, `GUEST_REPRESENTATIVE` |
| `save_expense(payload, expected_version?, request_id)` | payload에 `manual_rate?`(값이 있으면 fx_source='manual'). 검증 → 환율 확정(**`fx_rates` 캐시만 읽는다**. 결제일부터 10일 거슬러 찾기도 SQL로 하고, 캐시가 없으면 pending) → 박스 원화 최대 잔여 배분 → upsert(지출·박스·지정·대상 인원·사진 경로) → 이력 스냅샷 → version+1 | `VERSION_CONFLICT`, `AMOUNT_INVALID`, `DATE_IN_FUTURE`, `MEMBER_LEFT`, `INVALID_PAYER`, `SCOPE_EMPTY` |
| `delete_expense(id, expected_version)` (P0) / `restore_expense(id)` (P1) | 소프트 삭제·복구 + 이력 | `VERSION_CONFLICT` |
| `reconfirm_pending_fx(room_id)` | 환율 대기 지출을 캐시로 다시 확정 + 이력 + version+1. 정산·상세 화면을 열 때 `fx-rate`로 캐시를 채운 뒤 호출 | |
| `merge_expenses(keep_id, drop_id, keep_version, drop_version)` (P1, 피드에서 저장된 두 건을 합칠 때) | drop의 사진을 keep으로 옮기고 drop을 소프트 삭제(drop의 박스·지정은 버린다) + 양쪽 이력 | `VERSION_CONFLICT` |
| `add_member_to_expenses(room_id, member_id, expense_ids[])` (P1) | 대상 인원에 추가 + 각 지출 이력 + version+1 | |
| `room_balances(room_id, confirmed_only bool)` | **순잔액의 유일한 정답.** 사람별 `{paid, owed, net}` + 환율 대기 건수.<br>paid = 결제(원화 확정분) + 공금 입금 + 보낸 송금<br>owed = 분담 + 자투리 + 받은 송금 + (통장 주인이면 남은 공금, 음수 허용)<br>net = paid − owed<br>환율 대기 지출과 무효 송금은 제외한다. confirmed_only면 확인된 송금만 반영한다. 공금 행은 반환하지 않는다. 나간·탈퇴 멤버도 포함한다.<br>게스트 행도 `{paid, owed}`와 `representative_member_id`를 반환하지만, 게스트의 net은 0으로 두고 대표자의 net에 합산한다(송금 매칭 대상은 user 참여자만) | |
| `request_payout_account(room_id, owner_member_id)` | 계좌 요청 room_event 생성 | |
| `record_transfer(id, room_id, from_member_id, to_member_id, amount_krw)` | 양쪽 모두 user 참여자여야 한다. 호출자가 from(보냄) 또는 to(받음 → 바로 확인 처리)여야 한다. `id`로 멱등 처리한다 | `FORBIDDEN`, `AMOUNT_INVALID`, `MEMBER_LEFT` |
| `confirm_transfer(id)` / `reject_transfer(id)` | to 본인만 호출. 확인하거나 '못 받음'으로 무효화한다 | `FORBIDDEN` |
| `cancel_transfer(id)` | from 본인만, 확인 전에만 호출 | `ALREADY_CONFIRMED` |
| `set_pool(room_id, enabled, owner_member_id, card_last4[])` / `upsert_pool_deposits(room_id, rows[])` | 공금 결제·입금이 있으면 끌 수 없다. 통장 주인을 바꾸면 이력을 남긴다 | `POOL_IN_USE` |
| `set_payout_account(…)` / `get_payout_account(room_id, owner_member_id)` | §4 계좌번호 참고 | `RATE_LIMITED` |
| `set_manual_rate(room_id, currency, rate)` (P1) | 방 단위 수동 환율을 저장하고, 해당 통화의 환율 대기 지출을 재확정한다 | |
| `expense_history(expense_id)` | 이력 목록(삭제된 지출 포함) | |

### 5.2 Edge Functions
| 함수 | 요청 → 응답 | 비고 |
|------|------------|------|
| `parse-expense` | `{room_id, kind:'image'|'text', storage_path?, text?}` → `{is_receipt, merchant, paid_local_date, paid_local_time, currency, currency_ambiguous, total, krw_charged, card_last4, items:[{name_original,name_ko,quantity,amount,confidence}], confidence}` | 클라이언트 타임아웃 30초. 서버는 zod 실패나 `stop_reason='max_tokens'`이면 1회 재요청 후 실패로 처리한다. 긴 영수증이 잘리면 총액 박스로 대신한다. 클라이언트는 **자동 재시도하지 않는다**(비용) |
| `fx-rate` | `{date, currency}` → `{base_date, rate, source}` 또는 `{status:'pending'|'unsupported'}` | 날짜가 KST 오늘보다 뒤면 pending(현지 날짜가 KST보다 하루 앞설 수 있음). 캐시에 없으면 그날 전 통화를 한 번에 조회해 저장한다. 처리할 것: `JPY(100)`·`IDR(100)`은 100으로 나누고, `deal_bas_r`의 쉼표를 파싱하고, CNY는 CNH로 매핑한다. 과거 날짜는 최대 10일 거슬러 찾고, 오늘이면서 고시 전이면 pending이다. SSL·네트워크 실패도 pending이다 |
| `delete-account` | `{confirm_text}` → `{ok}` / 에러 `ACCOUNT_HAS_BALANCE` | 모든 활성 방에서 `room_balances(…, true)` 기준 net = 0이고 환율 대기 지출이 0건인지 확인한 뒤 `auth.admin.deleteUser(id, true)`(soft)로 지우고, profile 익명화·계좌 삭제·푸시 토큰 삭제를 한다 |

## 6. 데이터 흐름
### 6.1 로그인
```
카카오(P0): signInWithOAuth({provider:'kakao', options:{redirectTo:'splito://auth/callback', skipBrowserRedirect:true}})
            → WebBrowser.openAuthSessionAsync(url, redirectTo) → 콜백 URL의 code → exchangeCodeForSession (PKCE)
네이버(해커톤 포함, PoC 실패 시 제외): Supabase 커스텀 OIDC 제공자 'custom:naver'(issuer https://nid.naver.com, scope openid) — 흐름은 카카오와 같다.
            0단계 PoC에서 RN 동작을 확인하고, 실패하면 P2로 미룬다(Edge Function 우회 구현은 하지 않는다).
Apple(P1, iOS): expo-apple-authentication → signInWithIdToken({provider:'apple', token, nonce})
공통: 세션 → profiles 조회 → 동의가 없으면 consent → profile-setup → 대기 중인 초대 → 합류 시트 / 홈
```
`auth/callback`은 로그인이 진행 중일 때(대기 중인 PKCE verifier가 있을 때)만 처리하고, 그 외에는 무시한다.

### 6.2 초대 딥링크
```
링크: https://{LINK_DOMAIN}/i/{token}  — 해커톤은 Vercel 기본 서브도메인(`splito-trip.vercel.app`), 출시 전 자체 도메인으로 교체
      (도메인은 app.config.ts의 associatedDomains·intentFilters에 박히므로 바꾸면 앱 재빌드가 필요하다. 환경변수 `EXPO_PUBLIC_LINK_DOMAIN`으로 한 곳에서 관리)
      AASA·assetlinks 대상 경로는 /i/* 하나. assetlinks에는 Play 앱 서명 키(개발 빌드는 EAS 키) SHA-256
설치됨 : Universal/App Link → app/i/[token].tsx → pending_invite 저장(SecureStore, 24h) → 로그인 확인 → preview_invite → 시트 → join_room
미설치 : Vercel 랜딩
         Android → Play Store URL에 referrer=invite_{token} → 첫 실행에서 Install Referrer(expo-application)
         iOS     → [앱 받기]를 누르면 링크를 클립보드에 복사 → App Store → 첫 실행 온보딩에 ClipboardPasteButton("초대 링크 붙여넣기")
         → 실패하면 "초대 링크 붙여넣기" 입력칸(로그인 화면 하단)
해커톤(스토어 출시 전): 랜딩은 스토어 대신 EAS 내부 배포 링크(Android APK, iOS 등록 기기)로 보낸다.
         이때 Install Referrer가 없으므로 두 플랫폼 모두 클립보드 붙여넣기로 복원한다.
```

### 6.3 지출 입력
```
[사진] 촬영/선택(exif:false) → 리사이즈·재인코딩 → expense_id(UUID) 생성 → Storage 업로드 {room}/{expense_id}/{uuid}.jpg
       → parse-expense(kind:'image') → 응답
[문자·음성] 텍스트(음성은 expo-speech-recognition ko-KR, 최대 60초, 자막 수정 가능) → parse-expense(kind:'text')
[직접] 입력 폼
 → 확인 화면: fx-rate로 미리보기 환율 → lib/money로 박스 원화 미리보기 → lib/duplicate로 최근 72시간 지출과 비교
 → 사용자 수정·결제자·대상 인원·지정
 → save_expense(request_id = expense_id) — 서버가 fx_rates 캐시로 환율·원화를 확정(미리보기 단계의 fx-rate 호출이 캐시를 채운다) → Realtime으로 전파
[중복 → 합치기] 확인 화면에서 [합치기] = 기존 지출을 save_expense(기존 id, expected_version)로 갱신한다(사진 추가, 문자에 원화 청구액이 있으면 krw_charged 적용). 작성 중이던 지출은 버린다.
작성 중 상태는 기기(services/drafts: JSON은 AsyncStorage, 사진은 expo-file-system documentDirectory, 방마다 1건)에만 있다. DB에는 저장된 지출만 있다.
앱이 종료되면 다음 실행에서 이어 쓴다. 오프라인이면 사진·텍스트를 기기에 보관한다(P1).
```

### 6.4 실시간 동기화
- 방 화면에 들어오면 채널 `room:{room_id}` 하나를 구독한다. `postgres_changes` 대상 테이블은 6개다:
  - `expenses`, `comments`, `room_members`, `transfers`, `pool_deposits`: 필터 `room_id=eq.{id}`
  - `rooms`: 필터 `id=eq.{id}`
- 박스·지정·대상 인원·사진이 바뀌면 `expenses.version`이 항상 올라가므로, `expenses`의 UPDATE 이벤트로 감지된다. DELETE 이벤트는 필터가 적용되지 않으므로 하드 삭제를 쓰지 않는다.
- 이벤트는 TanStack Query 키를 **무효화**하는 데만 쓴다.
- 포그라운드로 돌아오거나 네트워크가 재연결되면 방 쿼리 전체를 무효화한다(끊긴 동안의 이벤트는 다시 오지 않는다).
- 방 크기(2~10명)에서는 postgres_changes로 충분하다. Broadcast 전환은 P2다.

### 6.5 정산
```
room_balances(room_id, false) → 사람별 net(화면용, 확인 대기 송금 포함) + 환율 대기 건수
 → lib/matching: 매 단계 남은 잔액으로 다시 정렬해 최대 채권자와 최대 채무자를 min(두 금액)으로 짝짓는다
   (같은 금액이면 joined_at → member id 순. 게스트는 대표자에 합산된 뒤라 매칭에 나오지 않는다) → 송금 카드
 → 송금 카드의 계좌: get_payout_account(내가 줄 사람인 카드만 원문)
'정산 완료'·나가기·탈퇴 판정: room_balances(room_id, true) — 서버에서만 판정
```

## 7. 상태 관리
- **서버 상태**: TanStack Query. 키는 `['rooms']`, `['room', id]`, `['room', id, 'feed']`, `['room', id, 'balances']`, `['expense', id]`, `['me']`. `staleTime` 30초.
- **쓰기**: `useMutation` → RPC. 낙관적 업데이트는 댓글에만 쓴다. 금액·지정은 서버 응답 후 반영한다.
- **세션**: `AuthProvider`(`onAuthStateChange`). 세션이 만료되면 작성 중 지출을 기기에 남기고 로그인으로 보낸 뒤, 로그인 후 원래 화면으로 돌아온다.
- **대기 중인 초대**: SecureStore `pending_invite`(토큰, 저장 시각). 24시간 뒤 만료되고, 합류에 성공하거나 `INVITE_INVALID`이면 삭제한다.
- **오프라인**: 읽기는 Query 캐시로 한다. 쓰기는 차단하고 입력은 기기에 보관한다(P1에서는 "올릴 지출" 목록으로 보여준다).

## 8. 에러 처리
**원칙**
- 사용자 메시지는 한국어이고, 다음에 할 일을 함께 알려준다.
- 금액에 영향을 주는 실패는 배지(`환율 대기`, `확인 필요`)로 남긴다. 조용히 무시하지 않는다.
- 읽기 쿼리는 3회 재시도한다(지수 백오프). **4xx와 mutation은 자동 재시도하지 않는다.** 대신 모든 쓰기는 클라이언트 UUID로 멱등하게 만든다.

| 코드 | 상황 | 사용자 메시지 | 복구 |
|------|------|--------------|------|
| `VERSION_CONFLICT` | 동시 수정 | 다른 분이 먼저 수정했어요. 최신 내용을 불러왔어요 | 최신값과 내 수정값을 비교해 다시 적용한다 |
| `NOT_A_RECEIPT` | 영수증이 아니거나 품목 0개 | 영수증을 찾지 못했어요 | 다시 찍기 / 직접 입력 |
| `PARSE_TIMEOUT`·`PARSE_FAILED`·`PARSE_INVALID` | AI 실패 | 영수증을 읽지 못했어요 | 다시 시도(수동) / 직접 입력, 사진 유지 |
| `AI_QUOTA_EXCEEDED` | 일일 한도 초과 | 오늘 자동 인식을 다 썼어요 | 직접 입력 |
| `UPLOAD_FAILED`·`UPLOAD_INVALID` | 업로드 실패 | 사진을 올리지 못했어요 | 기기에 보관하고 다시 시도 |
| `FX_PENDING` | 환율 조회 실패·고시 전 | 환율을 아직 가져오지 못했어요. 나중에 다시 확정할게요 | 대기 배지 / 수동 입력 |
| `FX_UNSUPPORTED` | 미고시 통화 | 이 통화는 자동 환율이 없어요 | 방 수동 환율 입력 |
| `DATE_IN_FUTURE` | 미래 결제일 | 결제일이 미래로 되어 있어요 | 날짜 수정 |
| `AMOUNT_INVALID` | 원본 합계 ≤ 0, 송금액 ≤ 0 | 금액을 확인해 주세요 | 수정 |
| `SCOPE_EMPTY` | 대상 인원 0명 | 나눌 사람을 1명 이상 골라주세요 | 선택 |
| `MEMBER_LEFT` | 나간 멤버를 지정 | 방을 나간 멤버예요 | 목록 새로고침 |
| `INVITE_INVALID` | 무효 초대 | 사용할 수 없는 초대예요. 새 링크를 요청하세요 | 링크 붙여넣기 |
| `BALANCE_NOT_ZERO`·`FX_PENDING_EXISTS`·`POOL_OWNER` | 나가기 차단 | 정산을 마친 뒤 나갈 수 있어요 | 정산 화면 |
| `ACCOUNT_HAS_BALANCE` | 탈퇴 차단 | 정산 중인 여행이 있어요 | 방 목록 |
| `ROOM_DELETED` | 삭제된 방 | 삭제된 여행이에요 | 목록으로 이동 |
| `AUTH_EXPIRED` | 401 | 다시 로그인해 주세요 | 작성 중 내용 유지 → 로그인 → 원래 화면 |
| `LOGIN_CANCELLED` | OAuth 취소 | 로그인이 취소됐어요 | 다시 시도 |
| `STT_UNAVAILABLE`·`PERMISSION_DENIED` | 음성 엔진 없음, 권한 거부 | 음성 인식을 쓸 수 없어요 / 설정에서 권한을 켜주세요 | 직접 입력 / OS 설정 |
| `OFFLINE` | 네트워크 없음 | 인터넷 연결이 필요해요 | 입력 보관 |
| `RATE_LIMITED` | 한도 초과 | 잠시 후 다시 시도해 주세요 | — |
| `GUEST_REPRESENTATIVE` | 게스트 대표자의 나가기 | 대표하는 게스트를 다른 분께 넘긴 뒤 나갈 수 있어요 | 게스트 대표자 변경 |
| `GUEST_IN_USE` | 장부에 쓰인 게스트 삭제 | 지출에 포함된 게스트는 삭제할 수 없어요 | 이름·대표자만 변경 |
| `INVALID_INPUT` | 형식 오류 | 입력값을 확인해 주세요 | 수정 |
| `FORBIDDEN` | 권한 없음 | 이 작업을 할 권한이 없어요 | — |
| `CURRENCY_LOCKED` | 지출 있는 방의 통화 변경 | 지출이 있어 기본 통화를 바꿀 수 없어요 | — |
| `INVALID_PAYER` | 결제자 오류(공금 꺼짐 등) | 결제자를 다시 선택해 주세요 | 선택 |
| `ALREADY_CONFIRMED` | 확인된 송금 취소 시도 | 이미 받은 분이 확인한 송금이에요 | 새로고침 |
| `POOL_IN_USE` | 공금 끄기 차단 | 공금 기록이 있어 끌 수 없어요 | — |

## 9. 테스트 전략
| 대상 | 도구 | 필수 케이스 |
|------|------|-----------|
| `room_balances`·`save_expense` 배분 | pgTAP(fixture SQL) | PRD F7 예시 2개 · 자투리가 결제자에게 감(결제자가 지정 밖일 때 포함) · 음수 할인 박스 floor · 최대 잔여 배분 동점 시 position 순 · 원본 합계 0 거부 · 합류·나가기 후 기존 분담 불변 · 공금 남음·부족(부호) · 송금 반영과 역송금 · confirmed_only 차이 · 1명 방 · 환율 대기 제외 · **게스트 몫이 대표자 net에 합산되고 게스트 net=0** · 게스트 결제자·공금 입금 · 대표자 변경 시 귀속 이동 |
| 속성 테스트 | jest(TS 참조 구현 → SQL 결과와 대조) | 무작위 방에서 잔액 합 0, 송금 ≤ N−1, 송금안 적용 후 0, 입력 순서를 섞어도 결과 동일 |
| `src/lib/*` | jest | matching 결정성, money 배분, 금액 표기, 초대 URL 정규식, 중복 점수, 에러 메시지 매핑 |
| RLS | pgTAP | 비멤버 읽기 거부, **멤버의 직접 INSERT·UPDATE·DELETE 거부**, 나간 멤버 거부, 계좌 마스킹·조회 조건, Storage 경로 정책 |
| `fx-rate` | Deno test | JPY(100)·IDR(100) 정규화, 쉼표 파싱, CNY → CNH, 주말·연휴 10일 거슬러 찾기, 11일째 pending, 고시 전 pending, 미래 날짜, KRW, x.5 반올림 |
| `parse-expense` | Deno test(Claude 모킹) + 수동 영수증 세트 | zod 실패·잘림·타임아웃, 경로 정규식 위반, 한도 초과, 세금·할인 줄 → 조정 박스, 통화 모호, 연도 없는 날짜, 인젝션 문구 |
| 동시성 | pgTAP | 동시 저장 → `VERSION_CONFLICT`, 송금 이중 기록 → 1건, 나가기와 저장 경합 |
| 화면 | @testing-library/react-native | 동의 화면 필수 체크, 확인 화면 합계 표시, 에러 코드별 메시지 |

## 10. 하네스 연동 (구현 시작 전 필요한 변경)
- **git**
  - `git init`은 끝났다. 하네스(`scripts/execute.py`)는 브랜치를 체크아웃하므로 **첫 커밋**이 있어야 한다.
  - `ios/`, `android/`(prebuild 산출물)은 `.gitignore`에 넣는다.
- **`package.json` 스크립트**: Stop 훅이 이 셋을 실행한다. 대화형·감시 모드는 금지다.
  - `"lint": "eslint . --max-warnings=0"`: eslint-config-expo는 0단계에서 미리 설치한다(`expo lint`의 첫 실행 질문 방지).
  - `"build": "tsc --noEmit"`
  - `"test": "jest --ci --passWithNoTests"`: create-expo-app 기본값 `--watchAll`은 Stop 훅을 멈추게 하므로 바꾼다.
- **`.claude/hooks/tdd-guard.sh` 예외 추가(반영 완료)**: `*/app/*`(Expo Router 화면. `_layout.tsx`·`[id].tsx`까지 포함), `*.d.ts`, `*/src/theme/*`, `*/src/services/*`, `*/src/hooks/*`, `*/web/*`.
  - 로직의 TDD는 `src/lib`에서 강제하고, DB 로직의 TDD는 pgTAP으로 한다(SQL 파일은 이미 예외다).
- **step의 AC(헤드리스로만 구성)**
  - `npm run lint && npm run build && npm test`
  - `npx expo export -p android`(번들·NativeWind 확인)
  - `npx expo prebuild --no-install --clean`(config plugin 확인)
  - `npx expo-doctor`
  - DB step: `supabase db reset && supabase test db`(Docker가 없으면 `blocked`)
- **사람이 직접 하는 단계**(데모는 iOS·Android 모두):
  - Apple Developer Program 가입(연 $99)과 `eas device:create`로 iOS 실기기 등록이 필요하다.
  - Android는 APK(내부 배포)로 설치한다.
  - EAS Development Build, 실기기 로그인, 딥링크, STT, 카메라 확인은 별도 step으로 두고 `blocked_reason: "manual QA"`로 처리한다. `claude -p` 세션은 외부 계정·기기 작업을 하지 않는다.
- **0단계 스파이크**(가장 먼저 확인할 것): Expo SDK 57 + NativeWind 4 + expo-speech-recognition 빌드, Supabase 카카오 OAuth PKCE 왕복, 수출입은행 `oapi` 도메인 SSL·응답 형식, 네이버 커스텀 OIDC.
- **`CLAUDE.md`(반영 완료)**: 자리표시자를 이 문서 기준으로 채웠다(스택, CRITICAL 규칙: 정수 원·RPC 쓰기 전용·room_balances 유일 정답·비밀값 위치·새 테이블 RLS+pgTAP, 명령어).
