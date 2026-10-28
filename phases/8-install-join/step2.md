# Step 2: install-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 앱 미설치 실기기·내부 배포 링크가 필요하다.

세션이 할 일: `phases/8-install-join/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] `eas build --profile preview`로 Android APK·iOS 내부 배포 링크 생성, `web/i/landing.js`의 `ANDROID_URL`·`IOS_URL` 교체 후 Vercel 재배포
- [ ] 앱 없는 Android 기기: 카톡 링크 → 랜딩 → [앱 받기] → 설치 → 첫 실행 [초대 링크 붙여넣기] → 로그인 → 합류 시트
- [ ] 앱 없는 iOS 기기(등록 기기): 같은 흐름, `ClipboardPasteButton` 동작
- [ ] 엉터리 문자열 붙여넣기 → "초대 링크를 찾지 못했어요"

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 8-install-join`을 다시 실행해 phase를 마무리한다.
