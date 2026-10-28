# Step 4: spike-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: EAS 빌드·실기기·외부 계정이 필요하다(CLAUDE.md 하네스 실행 규칙).

세션이 할 일: `phases/0-setup/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트 (ARCHITECTURE §10 0단계 스파이크)

- [ ] `eas login` → `eas init`(projectId가 `app.config.ts`에 들어가면 커밋)
- [ ] Apple Developer Program 가입, `eas device:create`로 iOS 실기기 등록
- [ ] `eas build --profile development -p android` / `-p ios` 성공, 실기기 설치
- [ ] 실기기에서 `app/index.tsx`가 Pretendard + NativeWind 색으로 보이는지
- [ ] expo-speech-recognition 네이티브 모듈이 Development Build에 포함됐는지(임시 버튼으로 권한 요청이 뜨는지만 확인, 코드는 커밋하지 않음)
- [ ] Supabase 프로젝트 생성(ap-northeast-2), Docker Desktop 설치(`supabase start` 동작)
- [ ] 카카오 디벨로퍼스 앱 생성, Supabase 카카오 OAuth 설정, Redirect `splito://auth/callback` — PKCE 왕복은 2-auth phase에서 확인
- [ ] 한국수출입은행 Open API 키 발급, `curl "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=...&searchdate=YYYYMMDD&data=AP01"` SSL·응답 형식 확인
- [ ] 네이버 커스텀 OIDC PoC: Supabase 대시보드에서 `custom:naver`(issuer `https://nid.naver.com`) 등록 가능 여부. 불가하면 `phases/index.json`에서 `11-naver`를 제거(P2로 내림)
- [ ] Anthropic API 키 발급, 사용할 모델 ID 확정(`CLAUDE_MODEL` Secret 값)

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 0-setup`을 다시 실행해 phase를 마무리한다.
