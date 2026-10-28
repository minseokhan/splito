# Step 3: error-codes

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §5 에러 규약, §8 에러 처리 표 전체
- 이전 step 산출물: `jest.config.js`, `tsconfig.json`

## 작업

서버·클라이언트 에러 코드를 사용자 메시지로 바꾸는 순수 함수를 TDD로 만든다. 이후 모든 phase가 이 모듈을 쓴다.

1. 테스트를 먼저 작성한다: `src/lib/errors.test.ts`
2. 구현: `src/lib/errors.ts`

```ts
export const ERROR_CODES = [/* ARCHITECTURE §8 표의 모든 코드 */] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type UserError = { code: ErrorCode | 'UNKNOWN'; message: string; action?: string };

// Supabase RPC 에러(PostgrestError: message에 코드 문자열), Edge Function 에러({error:{code}}),
// 네트워크 실패(TypeError 'Network request failed') 등 unknown 입력을 받아 UserError로 바꾼다.
export function toUserError(err: unknown): UserError;
export function isErrorCode(value: unknown): value is ErrorCode;
```

핵심 규칙
- 메시지와 복구 문구는 §8 표의 한국어 문구를 그대로 쓴다(`PARSE_TIMEOUT`·`PARSE_FAILED`·`PARSE_INVALID`처럼 한 행에 여러 코드면 같은 메시지).
- RPC는 `errcode P0001` + `message = '<CODE>'`로 실패를 알린다. `message`가 정확히 코드 문자열일 때만 그 코드로 인식한다.
- HTTP 401 / `JWT expired` → `AUTH_EXPIRED`. 네트워크 실패 → `OFFLINE`.
- 알 수 없는 입력은 `{code:'UNKNOWN', message:'잠시 후 다시 시도해 주세요'}`. 원본 에러 메시지를 사용자에게 노출하지 않는다.

테스트 케이스: 표의 모든 코드 매핑(테이블 기반 `it.each`), PostgrestError 형태, Edge Function 에러 형태, 401, 네트워크 에러, `null`/문자열/임의 객체 → UNKNOWN.

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
3. 결과에 따라 `phases/0-setup/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 테스트보다 구현 파일을 먼저 만들지 마라. 이유: TDD 가드 훅이 차단한다.
- 에러 원문(SQL 메시지, 스택)을 `message`에 넣지 마라. 이유: 내부 정보 노출.
- Sentry·로깅을 추가하지 마라. 이유: P1이다.
