# Step 0: invite-lib

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §4 딥링크(토큰 정규식), §6.2 초대 딥링크, §7 대기 중인 초대
- `/docs/ADR.md` ADR-008
- `/docs/PRD.md` §6 F2, §7.1 기본 통화
- 이전 phase 산출물: `src/lib/errors.ts`, `src/lib/entryRoute.ts`

## 작업

초대 URL·토큰과 통화 목록의 순수 로직을 TDD로 만든다. 테스트 먼저.

1. `src/lib/invite.ts` (+ `src/lib/invite.test.ts`)
   ```ts
   export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
   export function buildInviteUrl(domain: string, token: string): string;      // https://{domain}/i/{token}
   // https URL, splito:// URL, 경로만(/i/..), 토큰만 — 모두 받아 토큰을 꺼낸다. 앞뒤 공백·카톡 메시지 속 URL도 허용.
   export function extractInviteToken(input: string, domain: string): string | null;
   export type PendingInvite = { token: string; savedAt: number };
   export function isPendingInviteValid(p: PendingInvite | null, now: number): boolean;  // 24시간
   ```
   - 다른 도메인의 `/i/...`는 거부한다(피싱 링크 방지).
2. `src/lib/currency.ts` (+ test)
   ```ts
   export const CURRENCIES: readonly { code: string; label: string; unit: 1 | 100; symbol: string }[];
   // KRW, JPY(100), USD, EUR, CNY, HKD, TWD, THB, VND, PHP, SGD, IDR(100), AUD, GBP, CAD, CHF
   export function isCurrencyCode(v: string): boolean;
   ```

테스트: 정규식 경계(21·22·23자, 금지 문자), 각 입력 형태별 추출, 다른 도메인 거부, 24시간 경계, CURRENCIES 코드 중복 없음.

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
3. 결과에 따라 `phases/3-rooms/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 6자리 초대 코드 파싱을 추가하지 마라. 이유: ADR-008.
- 통화별 환율 값을 하드코딩하지 마라. 이유: 환율은 서버 `fx_rates`만 쓴다.
