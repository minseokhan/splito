# Step 3: activity-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 실기기 여러 대가 필요하다.

세션이 할 일: `phases/7-activity/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] 댓글 작성 → 다른 기기 상세에 반영, 본인 댓글 삭제
- [ ] 합류·송금·계좌 확인·계좌 요청이 피드에 시스템 메시지로 보임
- [ ] 계좌 요청 메시지 탭 → 계좌 등록 화면

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 7-activity`를 다시 실행해 phase를 마무리한다.
