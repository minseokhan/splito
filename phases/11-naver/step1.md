# Step 1: naver-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 네이버 개발자 계정·실기기 로그인이 필요하다.

세션이 할 일: `phases/11-naver/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] 네이버 개발자센터 앱 등록, Callback URL에 Supabase 콜백 등록
- [ ] Supabase 대시보드 커스텀 OIDC `custom:naver`(issuer `https://nid.naver.com`, scope `openid`) 설정
- [ ] iOS·Android 실기기: 네이버 로그인 → 동의 → 닉네임 미리 채움 → 목록
- [ ] 같은 사람이 카카오로 로그인하면 별도 계정(계정 통합 없음)인지

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 11-naver`를 다시 실행해 phase를 마무리한다.
