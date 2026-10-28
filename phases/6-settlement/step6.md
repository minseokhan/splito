# Step 6: settle-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 실기기 여러 대·원격 Vault 키 설정이 필요하다.

세션이 할 일: `phases/6-settlement/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] 원격 Vault에 운영용 `payout_account_key` 생성(로컬 seed 키와 다른 값), 마이그레이션 반영
- [ ] 4인 방에서 PRD F7 예시 1 재현 → D→A 30만, C→B 10만
- [ ] 계좌 등록 → 줄 사람 화면에만 원문, 받을 사람 방 활동에 확인 기록
- [ ] 복사 → 은행 앱 붙여넣기, [보냈어요] → 받을 사람 [받았어요] → '정산 완료'
- [ ] [못 받았어요]·[취소] 흐름
- [ ] 정산 후 지출 추가 → 남은 송금만, 갱신 배너
- [ ] 모든 기기에서 같은 송금안

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 6-settlement`를 다시 실행해 phase를 마무리한다.
