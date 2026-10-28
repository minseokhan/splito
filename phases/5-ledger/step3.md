# Step 3: expense-detail

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` §1 항목 상세, J4 5번, J5
- `/docs/PRD.md` §6 F3(동시 수정 충돌 문구), F5.4
- `/docs/ARCHITECTURE.md` §4 Storage(서명 URL 10분), §5.1 `delete_expense`·`reconfirm_pending_fx`, §8 VERSION_CONFLICT
- 이전 step 산출물: `src/hooks/useExpense.ts`, `src/services/storage.ts`(`signedUrl`), `src/lib/history.ts`, `src/lib/money.ts`(`fxBasisLabel`), `src/lib/expenseForm.ts`, `app/(app)/rooms/[roomId]/expenses/review.tsx`

## 작업

항목 상세와 수정·삭제·이력을 만든다.

1. `app/(app)/rooms/[roomId]/expenses/[expenseId].tsx`
   - 원본 사진(서명 URL) 썸네일 → 탭하면 전체 화면 확대(RN `Modal` + `Image`, 핀치 확대는 ScrollView `maximumZoomScale`로).
   - 박스·결제자·대상 인원·`fxBasisLabel`.
   - 열 때 pending이면 `fxRate` → `reconfirmPendingFx`.
   - [수정]: 서버 값을 `ExpenseDraft`로 변환(`expenseForm`에 `draftFromExpense(detail)` 추가 — **테스트 먼저**)해 review 화면을 편집 모드(`?edit={expenseId}&version={n}`)로 연다. 저장은 `saveExpense(payload, version)`.
   - [삭제]: 확인 시트 → `deleteExpense(id, version)` → 장부 홈.
   - 수정 이력 섹션: `expenseHistory` → "지훈 · 10/22 21:14" + `diffSnapshots` 줄.
   - 댓글 자리는 비워 둔다(7-activity).
2. review 화면 편집 모드: 편집용 draft는 AsyncStorage draft와 섞지 않는다(메모리 상태). `VERSION_CONFLICT`면 "다른 분이 먼저 수정했어요. 최신 내용을 불러왔어요" → 최신 지출을 다시 불러와 draft를 갱신한다(덮어쓰지 않음).

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
3. 결과에 따라 `phases/5-ledger/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `VERSION_CONFLICT`를 무시하고 expected_version 없이 재저장하지 마라. 이유: 덮어쓰기 금지(PRD F3).
- 사진을 public URL로 보여주지 마라. 서명 URL(10분)만. 이유: ARCHITECTURE §4.
- 복구(`restore_expense`)·합치기(`merge_expenses`) 버튼을 만들지 마라. 이유: P1.
