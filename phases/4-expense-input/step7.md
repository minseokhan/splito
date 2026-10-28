# Step 7: input-screens

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` J3 입력 방식별 흐름, 실패 처리
- `/docs/UI_GUIDE.md` 바텀시트, 상태 화면(인식 중·인식 실패·첫 AI 인식), 아이콘(입력 방식), AI 슬롭 안티패턴
- `/docs/ADR.md` ADR-004
- `/docs/ARCHITECTURE.md` §6.3, §8 에러 표(PARSE_*, NOT_A_RECEIPT, AI_QUOTA_EXCEEDED, STT_UNAVAILABLE, PERMISSION_DENIED)
- 이전 step 산출물: `src/services/storage.ts`, `src/services/api.ts`, `src/services/drafts.ts`, `src/hooks/useDraft.ts`, `src/lib/expenseForm.ts`, `app/(app)/rooms/[roomId]/index.tsx`

## 작업

지출 추가 진입과 4가지 입력 방식, 인식 중·실패 화면을 만든다.

1. 장부 홈(`rooms/[roomId]/index.tsx`)에 FAB(56, `sky-800`, 아이콘 `ink-900`, `accessibilityLabel="지출 추가"`) → 입력 방식 바텀시트(사진 / 문자 붙여넣기 / 음성 / 직접 입력). 작성 중 draft가 있으면 "작성 중인 지출 1건" 배너 → review로.
2. `app/(app)/rooms/[roomId]/expenses/new.tsx` (`?method=photo|text|voice|manual`)
   - 첫 AI 인식(photo·text·voice)이고 `profile.ai_notice_ack_at`이 없으면 시트 "사진·텍스트가 인식을 위해 Anthropic(미국)으로 전송돼요" [확인] [직접 입력할게요].
   - photo: 촬영/앨범(`exif: false`) → `preparePhoto` → 업로드 → `parseExpense(image)`. 캡처면 source `card_image`, 영수증이면 `receipt`(사용자가 시트에서 고른 값).
   - text: 붙여넣기 입력칸(4,000자 제한) → `parseExpense(text)`, source `card_text`.
   - voice: `expo-speech-recognition` ko-KR, 실시간 자막, 최대 60초, 멈춘 뒤 자막 수정 가능 → `parseExpense(text)`, source `voice`. 엔진 없음 → `STT_UNAVAILABLE`, 권한 거부 → `PERMISSION_DENIED` 안내 + 직접 입력.
   - manual: `emptyDraft`로 바로 review.
   - 인식 중: "영수증을 읽고 있어요" + 진행 표시 + [취소](AbortController).
   - 실패: "영수증을 읽지 못했어요" + [다시 시도](수동) [직접 입력]. 사진은 draft에 유지.
   - 성공: `draftFromParse` → draft 저장 → `expenses/review`로 replace.
3. 컴포넌트: `src/components/BottomSheet.tsx`(RN `Modal` + 상단 라운드 16, 손잡이 바 — 새 바텀시트 라이브러리 추가 금지), `src/components/InputMethodSheet.tsx`, `src/components/ParsingState.tsx`.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
npx expo export -p android
npx expo prebuild --no-install --clean
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/4-expense-input/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- "AI가 분석 중 ✨" 같은 장식 문구·블러·글로우를 쓰지 마라. 이유: UI_GUIDE 안티패턴.
- 인식 실패 시 자동 재시도하지 마라. 이유: 비용.
- 음성 파일을 서버로 보내지 마라. 텍스트만. 이유: ADR-004.
- `@gorhom/bottom-sheet` 등 새 UI 라이브러리를 추가하지 마라. 이유: 의존성 최소화.
