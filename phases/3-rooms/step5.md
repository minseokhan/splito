# Step 5: rooms-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 딥링크·실기기·Vercel 배포가 필요하다(CLAUDE.md 하네스 실행 규칙).

세션이 할 일: `phases/3-rooms/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] `web/`을 Vercel 프로젝트로 배포(Root Directory `web`), 도메인이 `EXPO_PUBLIC_LINK_DOMAIN`과 같은지
- [ ] AASA의 `TEAMID_PLACEHOLDER`, assetlinks의 `SHA256_PLACEHOLDER`(EAS 키 SHA-256)를 실제 값으로 교체·재배포
- [ ] 원격 DB에 3-rooms까지의 마이그레이션 반영
- [ ] Development Build 재빌드(associatedDomains·intentFilters 반영)
- [ ] 방 만들기 → 초대 → QR·카톡 공유·링크 복사
- [ ] 다른 기기(앱 설치·로그인됨): 링크 탭 → 앱 → 합류 시트 → 장부 홈
- [ ] 비로그인 기기: 링크 → 로그인·가입 → 합류 시트
- [ ] 이미 참여 중인 방 링크 → 바로 장부 홈 / 엉터리 토큰 → "사용할 수 없는 초대예요"

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 3-rooms`를 다시 실행해 phase를 마무리한다.
