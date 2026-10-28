# Step 2: auth-screens

## 읽어야 할 파일

- `/docs/UI_GUIDE.md` 로그인 버튼, 버튼, 입력 필드, 타이포그래피
- `/docs/USER_FLOWS.md` §1, J1 1~2, J2 B
- `/docs/PRD.md` §6 F1, §7.3 국외 이전 고지 항목
- 이전 step 산출물: `src/services/supabase.ts`, `src/services/auth.ts`, `src/hooks/useAuth.tsx`, `src/lib/entryRoute.ts`, `src/lib/profile.ts`, `app/_layout.tsx`

## 작업

로그인·동의·닉네임 화면과 인증 가드를 만든다. 화면은 조합만 하고 로직은 lib/services/hooks를 쓴다.

1. `app/(auth)/_layout.tsx`, `app/(auth)/login.tsx`
   - 카카오 로그인 버튼(배경 `#FEE500`, 글자 검정 85%, 높이 52, "카카오 로그인"). 네이버·Apple 버튼은 아직 없다.
   - 실패 시 `toUserError` 메시지를 버튼 위에 표시.
2. `app/auth/callback.tsx`: 진행 중 로그인이 있을 때만 URL의 `code`로 교환, 아니면 홈으로.
3. `app/(auth)/consent.tsx`
   - "필수 전체 동의" 체크 하나 + 개별 4항목(이용약관·만 14세 이상·개인정보 국외 이전 고지 확인·마케팅 수신(선택)). 약관/처리방침 링크는 `https://${EXPO_PUBLIC_LINK_DOMAIN}/terms`, `/privacy`.
   - 국외 이전 고지 요약(Anthropic 미국: 영수증 이미지·인식 텍스트 등 PRD §7.3)을 접힌 영역으로.
   - 필수 미체크 시 CTA 비활성 + 이유 문구. 거부(뒤로) 시 로그아웃하고 대기 초대는 남긴다.
   - react-hook-form + `zodResolver(consentSchema)`.
4. `app/(auth)/profile-setup.tsx`: 닉네임(SNS 값 미리 채움, 1~12자). 받을 계좌 입력은 6-settlement phase가 추가한다. 지금은 "계좌는 나중에 등록할 수 있어요" 안내 한 줄.
5. `app/index.tsx`: `resolveEntryRoute` 결과로 `<Redirect>`. `{join}` 분기는 3-rooms phase가 처리하므로 지금은 `/(app)`으로 보낸다(TODO 주석 한 줄).
6. `app/(app)/_layout.tsx`: 세션 없으면 login으로 리다이렉트하는 가드. `app/(app)/index.tsx`: 빈 상태 "첫 여행을 만들어 볼까요?"(버튼은 3-rooms에서 연결).
7. `src/components/PrimaryButton.tsx`, `src/components/Checkbox.tsx` 등 필요한 표시 컴포넌트만 만든다(UI_GUIDE 클래스 그대로).
8. 화면 테스트: `app/(auth)/__tests__/consent.test.tsx` — @testing-library/react-native로 필수 3개 체크 전 CTA 비활성, 체크 후 활성.

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

- 이메일·비밀번호·게스트 로그인 UI를 만들지 마라. 이유: PRD §7.3.
- 카카오 버튼 색을 하늘색으로 바꾸지 마라. 이유: UI_GUIDE — 제공자 브랜드 가이드 준수.
- 화면 파일에 Supabase 쿼리를 직접 쓰지 마라. 이유: `app/`은 조합만 한다(CLAUDE.md 폴더 역할).
- 회원 탈퇴·로그아웃 화면(`me.tsx`)을 만들지 마라. 이유: F9.2는 P1.
