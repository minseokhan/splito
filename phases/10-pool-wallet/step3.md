# Step 3: pool-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 실기기와 실제 카드 문자가 필요하다.

세션이 할 일: `phases/10-pool-wallet/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] 원격 DB에 마이그레이션 반영
- [ ] PRD F7 예시 2를 앱으로 재현 → B→A 10.5만, C→A 0.5만, D→A 0.5만
- [ ] 공금 카드 끝자리 등록 → 그 카드 승인 문자 붙여넣기 → 결제자 '공금' 자동 선택
- [ ] 공금 사용 중 끄기 차단, 통장 주인 변경 경고
- [ ] 정산 화면 "남은 공금 …은 B 님이 돌려줄 금액에 포함됐어요"

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 10-pool-wallet`을 다시 실행해 phase를 마무리한다.
