# Step 2: app-config

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §1, §2(`app.config.ts`, `eas.json`), §4(비밀값·딥링크), §6.2 초대 딥링크
- `/docs/ADR.md` ADR-001, ADR-004, ADR-008
- 이전 step 산출물: `app.json`, `package.json`, `babel.config.js`, `metro.config.js`

## 작업

`app.json`을 `app.config.ts`로 바꾸고 네이티브 설정과 EAS 프로필을 만든다.

1. 네이티브 의존성 설치(`npx expo install`): `expo-router`(이미 있으면 생략), `expo-linking`, `expo-web-browser`, `expo-secure-store`, `@react-native-async-storage/async-storage`, `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`, `expo-clipboard`, `expo-speech-recognition`, `expo-application`, `react-native-qrcode-svg`(+`react-native-svg`), `react-native-get-random-values`.
2. `app.config.ts` (`ExpoConfig` 타입)
   - `name: "스플리토"`, `slug: "splito"`, `scheme: "splito"`, `orientation: "portrait"`, `userInterfaceStyle: "light"`.
   - `ios.bundleIdentifier`·`android.package`: `app.splito` (가칭, 상수 하나로).
   - `ios.deploymentTarget`은 `expo-build-properties`로 `16.4`(expo-speech-recognition 요구). `npx expo install expo-build-properties`.
   - 링크 도메인: `const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? "splito.vercel.app"`.
     - `ios.associatedDomains: [`applinks:${LINK_DOMAIN}`]`
     - `android.intentFilters`: `autoVerify: true`, `https`, host `LINK_DOMAIN`, `pathPrefix: "/i/"`.
   - plugins: `expo-router`, `expo-secure-store`, `expo-font`, `expo-build-properties`, `expo-image-picker`(카메라·사진 권한 문구 한국어), `expo-speech-recognition`(마이크·음성 인식 권한 문구 한국어).
   - 권한 문구 예: "영수증을 찍어 지출을 기록하려면 카메라 권한이 필요해요."
3. `eas.json`: `development`(developmentClient true, distribution internal, android buildType apk), `preview`(internal, apk), `production`. `cli.appVersionSource: "remote"`.
4. `.env.example`: `EXPO_PUBLIC_SUPABASE_URL=`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=`, `EXPO_PUBLIC_LINK_DOMAIN=splito.vercel.app`. 이 세 개 외의 키를 넣지 마라.
5. `app.json`을 삭제한다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
npx expo prebuild --no-install --clean
npx expo-doctor
npx expo export -p android
```

`prebuild` 후 생긴 `ios/`, `android/`는 `.gitignore` 대상인지 `git status`로 확인한다.

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

- `ANTHROPIC_API_KEY`, `KEXIM_API_KEY`, `SERVICE_ROLE` 같은 비밀값을 `app.config.ts`·`.env.example`에 넣지 마라. 이유: 앱 번들에 포함된다(CLAUDE.md CRITICAL).
- `eas build`를 실행하지 마라. 이유: 외부 계정이 필요하다. 마지막 manual QA step에서 사람이 한다.
- 카카오 공유 SDK(`@react-native-kakao/*`)를 설치하지 마라. 이유: P1이다.
- Expo Go 호환을 위해 네이티브 모듈을 빼지 마라. 이유: Development Build 전제다(ADR-001).
