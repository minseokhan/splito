# Step 1: supabase-client

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §1(인증 저장 LargeSecureStore), §2(`src/services/supabase.ts`), §4 Auth 설정, §6.1, §7 세션
- `/docs/ADR.md` ADR-005
- 이전 step 산출물: `src/lib/entryRoute.ts`, `src/lib/profile.ts`, `src/types/database.ts`, `app.config.ts`

## 작업

Supabase 클라이언트, 세션 저장, 인증 컨텍스트, Query 클라이언트를 만든다.

1. `npm i @supabase/supabase-js @tanstack/react-query aes-js` (+ `@types/aes-js` dev). `react-native-get-random-values`는 0-setup에서 설치됨.
2. `src/services/largeSecureStore.ts`: Supabase 공식 React Native 가이드의 LargeSecureStore 패턴(AES-256 키는 `expo-secure-store`, 암호문은 AsyncStorage). `getItem/setItem/removeItem`.
3. `src/services/supabase.ts`
   ```ts
   export const supabase = createClient<Database>(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
     auth: { storage: new LargeSecureStore(), autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' } });
   ```
   - `AppState` 변화에 맞춰 `startAutoRefresh/stopAutoRefresh`.
4. `src/services/auth.ts`
   ```ts
   export async function signInWithKakao(): Promise<void>;   // signInWithOAuth({provider:'kakao', options:{redirectTo:'splito://auth/callback', skipBrowserRedirect:true}}) → WebBrowser.openAuthSessionAsync → code → exchangeCodeForSession
   export async function signOut(): Promise<void>;
   export async function updateConsent(input: ConsentInput): Promise<void>;   // profiles 본인 행 UPDATE (buildConsentUpdate 사용)
   export async function updateNickname(nickname: string): Promise<void>;
   ```
   - 사용자가 브라우저를 닫으면 `LOGIN_CANCELLED` 코드로 throw.
   - 로그인 진행 중 플래그를 모듈 변수로 두고, `auth/callback` 라우트는 플래그가 있을 때만 코드를 교환한다(ARCHITECTURE §6.1).
5. `src/hooks/useAuth.tsx`: `AuthProvider`(onAuthStateChange로 session 보관) + `useAuth()` → `{session, profile, refreshProfile}`. profile은 `profiles` 본인 행 조회.
6. `src/services/queryClient.ts`: `staleTime 30_000`, 읽기 retry 3(4xx 제외), mutation retry 0.
7. `app/_layout.tsx`: `QueryClientProvider` + `AuthProvider`로 감싼다.

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
3. 결과에 따라 `phases/2-auth/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `SUPABASE_SERVICE_ROLE_KEY`를 앱 코드에서 참조하지 마라. 이유: CLAUDE.md CRITICAL.
- 세션을 SecureStore에 통째로 저장하지 마라. 이유: 값당 약 2KB 제한(ARCHITECTURE §1).
- `detectSessionInUrl: true`나 implicit flow를 쓰지 마라. 이유: 모바일 PKCE 전제(ADR-005).
- 전역 상태 라이브러리(Redux, Zustand)를 추가하지 마라. 이유: ARCHITECTURE §1.
