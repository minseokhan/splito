# Step 0: naver-login

## 읽어야 할 파일

- `/docs/ADR.md` ADR-005
- `/docs/ARCHITECTURE.md` §6.1 로그인(네이버 커스텀 OIDC)
- `/docs/UI_GUIDE.md` 로그인 버튼(네이버 `#03C75A`, 흰 로고, 높이 52, 카카오 아래)
- 이전 phase 산출물: `src/services/auth.ts`(`signInWithKakao`), `app/(auth)/login.tsx`, `supabase/config.toml`

## 작업

네이버 로그인을 Supabase 커스텀 OIDC 제공자로 추가한다. 0-setup 스파이크에서 커스텀 OIDC가 동작하는 것이 확인된 경우에만 이 phase를 실행한다.

1. 구현 전에 Supabase 문서(context7 또는 Supabase MCP `search_docs`)로 커스텀 OIDC 제공자의 provider 식별자 형식과 `config.toml` 설정 키를 확인한다. 로컬 `config.toml`에서 지원하지 않으면 원격 대시보드 설정만 쓰고 config는 건드리지 않는다.
2. `src/services/auth.ts`: `signInWithKakao`의 흐름을 provider 인자로 일반화한 `signInWithProvider(provider: 'kakao' | 'custom:naver')`로 바꾸고, 두 버튼이 같은 함수를 쓴다(PKCE·`skipBrowserRedirect`·`LOGIN_CANCELLED` 동일).
3. `app/(auth)/login.tsx`: 카카오 버튼 아래 네이버 버튼.
4. `handle_new_user` 트리거가 네이버 메타데이터의 닉네임(`nickname`/`name`)을 읽는지 확인한다. 키가 다르면 새 마이그레이션으로 트리거를 교체하고 pgTAP 케이스를 추가한다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
npx expo export -p android
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/11-naver/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- Edge Function으로 네이버 코드를 교환해 magiclink를 넘기는 방식을 만들지 마라. 이유: ADR-005 — 커스텀 스킴 토큰 탈취 위험.
- 네이버 Client Secret을 앱·config 파일에 평문으로 넣지 마라. `env(...)` 참조만.
- Apple 로그인을 함께 추가하지 마라. 이유: F1.4는 P1.
