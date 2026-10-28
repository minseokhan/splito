# Step 0: auth-lib

## 읽어야 할 파일

- `/docs/PRD.md` §6 F1, §7.3 가입·동의
- `/docs/USER_FLOWS.md` §1 화면 맵(앱 실행 분기), J1 1~2단계, J2 분기 B
- `/docs/ARCHITECTURE.md` §6.1 로그인 흐름, §7 대기 중인 초대
- 이전 phase 산출물: `src/lib/errors.ts`, `src/types/domain.ts`, `src/types/database.ts`

## 작업

인증 흐름의 순수 로직을 TDD로 만든다. 테스트 파일을 먼저 작성한다.

1. `src/lib/profile.ts` (+ `src/lib/profile.test.ts`)
   ```ts
   export const TERMS_VERSION = '2026-10-28';
   export const nicknameSchema: z.ZodString;            // trim 후 1~12자
   export const consentSchema: z.ZodObject<{ terms: z.ZodLiteral<true>; age14: z.ZodLiteral<true>; overseas: z.ZodLiteral<true>; marketing: z.ZodBoolean }>;
   export function isConsentComplete(p: Pick<Profile, 'terms_agreed_at'|'age14_confirmed_at'|'overseas_notice_ack_at'>): boolean;
   // profiles UPDATE용 컬럼 값. 시각은 인자로 받아 테스트 가능하게.
   export function buildConsentUpdate(input: ConsentInput, now: Date): ProfileConsentUpdate;
   ```
   - `zod`를 설치한다(`npm i zod`).
2. `src/lib/entryRoute.ts` (+ test)
   ```ts
   type EntryState = { session: boolean; profileLoaded: boolean; consentComplete: boolean; nicknameSet: boolean; pendingInviteToken: string | null };
   export function resolveEntryRoute(s: EntryState): '/(auth)/login' | '/(auth)/consent' | '/(auth)/profile-setup' | { join: string } | '/(app)' | 'loading';
   ```
   - 순서: 세션 없음 → login · 프로필 로딩 중 → loading · 동의 미완 → consent · 닉네임 빈칸 → profile-setup · 대기 초대 있음 → `{join: token}` · 그 외 → `/(app)`.

테스트 케이스: 닉네임 0자/13자/공백만/12자 경계, 필수 동의 하나라도 false면 실패, 마케팅 false 허용, `buildConsentUpdate`의 marketing_opt_in_at은 true일 때만, entryRoute 모든 분기.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/2-auth/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- React·Supabase를 `src/lib`에서 import 하지 마라. 이유: 순수 로직 폴더다.
- 이메일·비밀번호 검증 로직을 만들지 마라. 이유: PRD §7.3 — SNS 로그인만.
