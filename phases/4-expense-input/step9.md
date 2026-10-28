# Step 9: input-manual-qa

## 이 step은 사람이 수행한다

`claude -p` 세션은 아래 체크리스트를 실행하지 마라. 이유: 카메라·음성 인식·실제 API 키가 필요하다(CLAUDE.md 하네스 실행 규칙).

세션이 할 일: `phases/4-expense-input/index.json`에서 이 step을 `"status": "blocked"`, `"blocked_reason": "manual QA"`로 바꾸고 즉시 종료한다. 코드·파일을 수정하지 마라.

## 사람이 할 체크리스트

- [ ] Supabase Secrets: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `KEXIM_API_KEY`, `AI_DAILY_GLOBAL_LIMIT`
- [ ] `supabase functions deploy fx-rate parse-expense`, 원격 DB 마이그레이션 반영
- [ ] 일본어·영어·한국어 영수증 각 5장: 품목·금액 정확도(목표 85%), 틀린 값에 '확인 필요'
- [ ] 사진 업로드부터 박스 표시까지 p50 8초 이하
- [ ] 업로드된 사진에 EXIF·GPS 없음(Storage에서 내려받아 `exiftool` 확인)
- [ ] 카드 승인 문자 붙여넣기, 결제앱 캡처, 음성 "카레 1만 1천 원, 덮밥 1만 5천 원, 닭꼬치 6천 원" → 박스 3개
- [ ] 직접 입력 저장, 세금·할인 영수증 → '기타' 조정 박스
- [ ] 같은 결제를 두 번 올려 중복 배너·합치기
- [ ] 앱 강제 종료 후 "작성 중인 지출 1건" 이어 쓰기
- [ ] 주말 결제일 환율이 직전 고시일 값인지

## 완료 처리

체크리스트를 마치면 사람이 이 step의 `status`를 `"completed"`, `summary`를 결과 한 줄로 바꾸고 `blocked_reason`·`blocked_at`을 지운 뒤 `python3 scripts/execute.py 4-expense-input`을 다시 실행해 phase를 마무리한다.
