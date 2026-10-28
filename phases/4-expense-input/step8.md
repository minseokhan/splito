# Step 8: review-screen

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` J3 확인·수정 화면 공통 동작 전체, J4 박스 사람 지정
- `/docs/UI_GUIDE.md` 품목 박스, 아바타, 입력 필드, 버튼, 시맨틱(확인 필요)
- `/docs/PRD.md` §6 F4·F5·F6
- `/docs/ARCHITECTURE.md` §6.3([중복 → 합치기]), §8(VERSION_CONFLICT 등)
- 이전 step 산출물: `src/lib/expenseForm.ts`, `src/lib/duplicate.ts`, `src/lib/money.ts`, `src/hooks/useDraft.ts`, `src/hooks/useFxPreview.ts`, `src/hooks/useRooms.ts`, `src/services/api.ts`, `app/(app)/rooms/[roomId]/expenses/new.tsx`

## 작업

확인·수정 화면(`app/(app)/rooms/[roomId]/expenses/review.tsx`)을 만든다. 상태 변경은 모두 `expenseForm` lib 함수로.

1. 상단: 가맹점, 결제일(수정 가능), 통화(수정 가능), 결제자(기본 나, 참여자 목록 — `payer_kind='pool'` 선택지는 10-pool-wallet phase가 추가), 대상 인원(아바타 토글, 최소 1명).
2. 원화 미리보기: `useFxPreview` + `allocateLargestRemainder`로 박스별 원화. "미리보기 — 저장 시 확정돼요" 보조 문구. pending이면 "환율 대기" 배지.
3. 품목 박스 목록: 원문(ink-500)·번역(ink-900)·수량×금액, 금액 수정, 지정 아바타(최대 4 + "+n"), 미지정 "전원" 칩, 확인 필요 테두리 `#F0C14B` + 배지(탭하면 해제), [쪼개기] [품목 추가]. 참여자 1명이면 지정 UI 숨김.
4. 사람 지정 바텀시트: 대상 인원 중에서만 체크. 아무도 안 고르면 "전원". "2명 · 1인 ¥1,640" 표시(`splitEvenly` 기반 미리보기).
5. 중복 배너: `api.recentExpenses(72h)` + `findDuplicate` → "어제 18:42 이치란 ¥3,280 지출과 같은 결제인가요? [합치기] [별개예요]". [합치기] = 기존 지출을 현재 version으로 `saveExpense`(사진 추가, `krw_charged` 있으면 적용), 작성 중 draft 폐기. 전체 기존 박스는 유지한다.
6. 하단 고정 CTA [저장]: `validateDraft` 실패 시 해당 필드로 스크롤·에러 문구. 성공 → `saveExpense(toSavePayload(draft), null)` → 장부 홈. 에러는 `toUserError` 메시지.
7. 컴포넌트: `src/components/ItemBox.tsx`, `src/components/AvatarStack.tsx`, `src/components/Avatar.tsx`(합류 순서 색 순환), `src/components/Badge.tsx`, `src/components/AssigneeSheet.tsx`.
8. 화면 테스트 `app/(app)/rooms/[roomId]/expenses/__tests__/review.test.tsx`: 박스 합계 표시, 대상 인원 0명 저장 불가 문구.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
npx expo export -p android
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

- 미리보기 원화를 payload에 넣거나 "확정" 금액처럼 표시하지 마라. 이유: 서버 확정(ADR-006).
- 드래그 앤 드롭 지정을 만들지 마라. 이유: P2, 탭 선택만.
- "나만 쓴 지출" 빠른 토글, 대상 인원 "직전과 같게"를 만들지 마라. 이유: P1.
- 결제 시각·금액 비교 로직을 화면 파일에 쓰지 마라. 이유: `lib/duplicate`를 쓴다.
