# Step 0: expo-scaffold

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (기술 스택, 명령어, 가드레일 훅)
- `/docs/ARCHITECTURE.md` §1 기술 스택, §2 디렉토리 구조, §10 하네스 연동
- `/docs/ADR.md` ADR-001
- `/.claude/hooks/stop-checks.sh`, `/.claude/hooks/tdd-guard.sh` (Stop 훅이 `npm run lint/build/test`를 실행한다)
- `/.gitignore`

레포에는 아직 앱 코드가 없다. `CLAUDE.md`, `docs/`, `scripts/`, `.claude/`, `phases/`만 있다.

## 작업

Expo SDK 57 + Expo Router + TypeScript strict 앱 골격을 레포 루트에 만든다.

1. 임시 디렉토리에서 스캐폴딩한 뒤 필요한 파일만 루트로 옮긴다.
   - 예: `npx create-expo-app@latest "$TMPDIR/splito-scaffold" --template default@sdk-57 --no-install`
   - 옮길 것: `package.json`, `tsconfig.json`, `app.json`(다음 step에서 `app.config.ts`로 바꾼다), `babel.config.js`(있으면), `assets/`, `app/`.
   - 템플릿의 예제 화면·컴포넌트·훅·상수(탭 예제, `components/`, `constants/`, `hooks/`, `scripts/reset-project.js`)는 가져오지 않는다.
2. `app/_layout.tsx`(Stack만 렌더)와 `app/index.tsx`("스플리토" 텍스트 하나)만 남긴다. 실제 화면은 이후 phase가 만든다.
3. `package.json`
   - `"name": "splito"`, `"main": "expo-router/entry"`.
   - scripts를 정확히 다음으로 둔다(Stop 훅이 비대화형으로 실행한다):
     ```json
     "lint": "eslint . --max-warnings=0",
     "build": "tsc --noEmit",
     "test": "jest --ci --passWithNoTests",
     "start": "expo start --dev-client"
     ```
   - devDependencies: `eslint`, `eslint-config-expo`, `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest`, `typescript`.
   - 의존성 버전은 `npx expo install <pkg>`로 SDK 57에 맞춘다(`expo-dev-client` 포함).
4. `tsconfig.json`: `extends: "expo/tsconfig.base"`, `strict: true`, `paths: {"@/*": ["./src/*"]}`, `exclude`에 `supabase/functions`, `web`, `node_modules`.
   - 이유: Edge Function은 Deno(`npm:`/URL import)라 Node `tsc`가 해석하지 못한다.
5. `eslint.config.js`(flat config, `eslint-config-expo/flat`). ignore: `supabase/functions/**`, `web/**`, `scripts/**`, `ios/**`, `android/**`, `dist/**`.
6. `jest.config.js`: `preset: "jest-expo"`, `testPathIgnorePatterns`에 `/supabase/`, `/web/`, `/node_modules/`.
7. `src/lib/`, `src/components/`, `src/hooks/`, `src/services/`, `src/types/`, `src/theme/` 폴더를 만들지 않는다(빈 폴더는 git에 안 남는다). 첫 파일이 생길 때 만든다.
8. `.gitignore`는 기존 내용을 유지하고 `.expo/`, `dist/`, `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `.env`, `.env.local`만 추가한다.

## Acceptance Criteria

```bash
npm install
npm run lint && npm run build && npm test
npx expo-doctor
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

- `CLAUDE.md`, `docs/`, `scripts/`, `.claude/`, `phases/`를 덮어쓰거나 수정하지 마라. 이유: 하네스 가드레일과 기획 문서다.
- `test` 스크립트에 `--watch`/`--watchAll`을 넣지 마라. 이유: Stop 훅이 멈춘다.
- Expo SDK 58 이상을 쓰지 마라. 이유: ADR-001에서 57로 고정했다.
- 이 step에서 NativeWind·Supabase·라우트 화면을 추가하지 마라. 이유: 이후 step의 범위다.
- `npx expo prebuild`로 만든 `ios/`·`android/`를 커밋하지 마라.
