# Step 4: ledger-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 실기기 여러 대의 실시간 동기화 확인이 필요하다.

세션이 할 일: `phases/5-ledger/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] 기기 A에서 저장 → 기기 B 피드에 3초 이내 반영
- [ ] 남이 올린 지출 수정 → 이력 "누가·언제·전/후"
- [ ] 두 기기에서 같은 지출 동시 수정 → 늦게 저장한 쪽에 충돌 문구, 덮어쓰기 없음
- [ ] 삭제 → 양쪽 피드에서 사라짐
- [ ] 비행기 모드 후 복귀 → 피드 최신화
- [ ] 사진 확대, 환율 근거 문구
- [ ] "여행 전" 묶음 표시

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 5-ledger`를 다시 실행해 phase를 마무리한다.
