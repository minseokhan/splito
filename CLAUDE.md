# 프로젝트: 스플리토 (Splito)

동행 공동 여행 가계부 앱. 영수증·카드 문자·음성으로 올린 지출을 AI가 품목 박스로 나누고, 결제일 환율로 원화를 확정하고, 최소 송금으로 정산한다. 상세 내용은 `docs/`(PRD, USER_FLOWS, ARCHITECTURE, ADR, UI_GUIDE)를 따른다.

## 기술 스택
- Expo SDK 57(고정) + Expo Router + React Native, TypeScript strict. 실행은 EAS Development Build로 한다(Expo Go 금지).
- NativeWind 4.x(Tailwind 3), TanStack Query v5, react-hook-form + zod.
- Supabase(서울): Postgres(RLS·RPC), Auth(카카오·네이버 커스텀 OIDC·Apple), Realtime, Storage, Edge Functions(Deno), Vault.
- Claude API `claude-sonnet-5-5`(Edge Function에서만 호출), 한국수출입은행 환율 API(`oapi.koreaexim.go.kr`), Vercel(정적 랜딩).

## 아키텍처 규칙
- CRITICAL: 금액은 원 단위 정수(DB `bigint`, TS 정수 `number`)로만 다룬다. 부동소수점 금액 연산은 금지다. 나눗셈은 floor로 한다.
- CRITICAL: 장부 테이블 쓰기는 `security definer` RPC로만 한다. 클라이언트가 직접 INSERT·UPDATE·DELETE하는 것은 금지다(예외: `comments`, 본인 `profiles`). RPC는 `set search_path = ''`, `auth.uid()` 확인, `anon` 실행 권한 회수를 지킨다.
- CRITICAL: 순잔액은 SQL `room_balances`가 유일한 정답이다. 원화 확정과 박스 배분은 `save_expense`(서버)가 한다. 클라이언트 TS는 미리보기·그리디 송금 매칭·표시만 한다.
- CRITICAL: 비밀값(ANTHROPIC·KEXIM·SERVICE_ROLE·계좌 암호화 키)은 Supabase Secrets/Vault에만 둔다. 앱 번들에는 `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_ANON_KEY`만 넣는다.
- CRITICAL: 새 테이블은 같은 단계에서 RLS를 켜고 pgTAP 테스트를 작성한다. 계좌번호는 암호화해서 저장한다. 영수증 사진은 EXIF를 제거한 JPEG만 업로드한다.
- 폴더 역할:
  - `app/`: 화면 조합만 한다.
  - `src/lib/`: 순수 로직이며 TDD가 필수다.
  - `src/services/`: 외부 호출을 맡는다.
  - `src/components/`: 표시만 한다.
  - `supabase/`: 마이그레이션·Edge Functions·pgTAP 테스트를 둔다.
- 색상·간격은 `docs/UI_GUIDE.md` 토큰만 쓴다. 하늘색(`sky-800`) 위에 흰 글자를 쓰지 않는다.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것(TDD). DB 로직은 pgTAP으로 한다.
- 커밋 메시지는 conventional commits 형식을 따를 것(feat:, fix:, docs:, refactor:).

## 브랜치·PR 규칙
- 흐름: `feat-<phase>`(dev에서 분기) → PR(base: **dev**) → 머지 → `dev` → PR(base: **main**, 승인 후 머지).
- CRITICAL: `main`과 `dev`에 직접 커밋·push하지 말 것. 모든 변경은 feat 브랜치 → dev PR로만 들어간다. 하네스 `execute.py`는 새 feat 브랜치를 dev에서 만든다.
- CRITICAL: PR 머지는 Claude가 하지 않는다. Claude는 dev로 PR만 올리고, 사용자가 승인하고 머지한다. main 반영은 사용자가 승인한 dev → main PR로만 한다.
- PR이 머지되면 원격 브랜치는 자동 삭제된다(레포 설정). 로컬 feat 브랜치와 워크트리도 정리한다: `git worktree remove <path>`, `git branch -d feat-<phase>`, `git fetch --prune`.

## 하네스 실행 규칙
- 하네스 `scripts/execute.py`는 각 step 실행 시 이 파일과 `docs/*.md`를 가드레일로 로드한다.
- 각 step은 이 파일에 명시된 작업만 수행하고, 요청되지 않은 기능/파일을 만들지 말 것.
- AC(Acceptance Criteria)를 직접 실행해 검증한 뒤 `phases/<phase>/index.json`의 step status를 갱신할 것.
- AC는 헤드리스 명령으로만 구성한다(아래 명령어). 다음이 필요한 검증은 수행하지 말고 즉시 `blocked` 처리한다(`blocked_reason: "manual QA"`):
  - EAS 빌드, 실기기, 로그인, 딥링크, 카메라, 음성 인식
  - 외부 계정·API 키
  - Docker가 없을 때의 `supabase` 명령

## 가드레일 (`.claude/settings.json`)
- `PreToolUse[Bash]`: 위험 명령(`rm -rf`, force push, `reset --hard`, `DROP TABLE`)을 차단한다.
- `PreToolUse[Edit|Write]`: 소스 파일에 대응하는 테스트가 없으면 편집을 차단한다(TDD 강제).
  - 예외: `app/`(Expo Router 화면), `src/components/`, `src/hooks/`, `src/services/`, `src/theme/`, `types/`, `*.d.ts`, `web/`, 설정·스타일·SQL 파일.
- `Stop`: 턴이 끝날 때 `lint`/`build`/`test`를 실행하고, 실패하면 수정을 이어가도록 유도한다(`package.json`이 없으면 건너뛴다). 스크립트는 반드시 비대화형으로 끝나야 한다(`--watch` 금지).

## 명령어
npm run lint                 # eslint . --max-warnings=0
npm run build                # tsc --noEmit (Expo에는 웹식 build가 없으므로 타입 검사로 대체)
npm run test                 # jest --ci --passWithNoTests
npx expo start --dev-client  # 개발 서버 (Development Build 필요)
npx expo export -p android   # 번들 스모크 테스트
npx expo prebuild --no-install --clean  # config plugin 검증 (ios/·android/는 .gitignore)
npx expo-doctor              # 의존성 호환 점검
supabase db reset && supabase test db   # 마이그레이션 + pgTAP (Docker 필요)

## 하네스
python3 scripts/execute.py <phase-dir> [--push]   # phase의 step을 순차 실행 (claude -p 호출)
python3 -m pytest scripts/test_execute.py         # 하네스 테스트
