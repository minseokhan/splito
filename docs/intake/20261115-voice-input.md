# Intake: 말로 입력 (splito-voice-handoff)

1차 소스: `code/voice-template.html`(인라인 수치), `code/voice-logic.js`(동작), 프로토타입 `commitExpense`(저장 후 장부로 이동). README는 요약이다.

## 판정표

| # | 항목 | 판정 | 근거 / 조치 |
|---|---|---|---|
| 1 | 기기 STT(ko-KR, 실시간, 60초 상한) | 반영됨 | 구 `new.tsx` 음성 분기 → `expenses/voice.tsx`로 옮김 |
| 2 | 말로 입력 전용 화면(카드 누적·합계·하단 마이크 시트) | 코드에 없음(신규) | `app/(app)/rooms/[roomId]/expenses/voice.tsx` |
| 3 | 한 발화 → 사람·품목·금액 여러 건 | 데이터 없음(기능작업) | 기존 `parse-expense`는 지출 1건+품목만 반환. `kind:'voice'`(`parseVoice`, `ParsedVoice`) 추가 |
| 4 | 사람 인식(목록에 없으면 나) | 신규 | 서버 `postprocessVoice`가 목록 밖 이름 → null, `lib/voice.cardsFromParse`가 null → 나 |
| 5 | 통화 | 결정: 말한 통화, 없으면 KRW | 서버 `postprocessVoice`. 카드 금액은 외화면 통화 기호(시안은 '원' 고정) |
| 6 | "지훈이 5천 원" 해석 | 결정: 지훈 몫, 결제자 나 | `lib/voice.voicePayload` scope=[그 사람], 박스 지정=[그 사람] |
| 7 | 카드 편집(사람 1명·품목·금액, 삭제/완료, 완료 조건) | 신규 | `canFinishEdit` |
| 8 | 저장: 카드마다 개별 지출, 일정에서 왔으면 연결 | 신규 | 한 건씩 `save_expense`, 성공한 카드는 목록에서 뺀다(실패 시 남은 것만 재시도) |
| 9 | 저장 후 이동 | 재설계 | README "목록 비움" vs 프로토타입 `commitExpense` = 장부로 이동 → 프로토타입을 따름 |
| 10 | 예외: 권한 거부 시트, 못 들음 문구, 금액 0 → 편집 자동 열림, 네트워크 토스트, 미저장 뒤로 확인 | 신규 | 전부 `voice.tsx` |
| 11 | 무료 AI 5건 한도 → 여행 패스 시트 | 반영됨 | `new.tsx` `MethodPicker.select`(DEMO_AI_USED 그대로) |
| 12 | 삭제 버튼 바탕 `#FEF3F2` | 토큰 없음 | 기존 `booking.tsx`처럼 임의값 사용 |
| 13 | 상태 "AI가 나누고 있어요"(인식 대기) | 추가 | 시안에 없는 중간 상태. 마이크 자리에 스피너 |
