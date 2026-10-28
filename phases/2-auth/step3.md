# Step 3: auth-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 실기기 로그인·외부 계정이 필요하다(CLAUDE.md 하네스 실행 규칙).

세션이 할 일: `phases/2-auth/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] 원격 Supabase에 마이그레이션 적용(`supabase link` → `supabase db push`)
- [ ] Supabase 대시보드: Email provider 끔, 카카오 provider 키 입력, Redirect URL `splito://auth/callback`(정확히 일치)
- [ ] `.env`에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 설정 후 Development Build로 실행
- [ ] iOS·Android 실기기: 카카오 로그인 → 신규면 동의 → 닉네임 → 빈 여행 목록
- [ ] 이미 가입한 계정은 동의 화면 없이 바로 목록
- [ ] 로그인 창을 닫으면 "로그인이 취소됐어요"
- [ ] 앱 재시작 후 세션 유지

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 2-auth`를 다시 실행해 phase를 마무리한다.
