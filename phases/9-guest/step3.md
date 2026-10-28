# Step 3: guest-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 실기기 확인이 필요하다.

세션이 할 일: `phases/9-guest/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] 원격 DB에 마이그레이션 반영
- [ ] 게스트 "엄마" 추가 → 디저트 박스를 엄마에게 지정 → 정산 표 "엄마(게스트 · 대표 민지)", 민지 카드 "엄마 몫 포함"
- [ ] 엄마를 결제자로 기록 → 민지 순잔액에 반영
- [ ] 대표자 변경 경고 → 송금안 이동
- [ ] 쓰인 게스트 삭제 차단, 안 쓰인 게스트 삭제
- [ ] 대표자 방 나가기 차단(RPC 레벨, UI는 P1)

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 9-guest`를 다시 실행해 phase를 마무리한다.
