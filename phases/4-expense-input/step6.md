# Step 6: input-services

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §1 이미지 행, §2 `src/services/storage.ts`·`drafts.ts`, §4 Storage, §6.3 지출 입력, §7
- `/docs/PRD.md` §7.3 영수증 원본 사진(EXIF 제거)
- 이전 step 산출물: `src/lib/expenseForm.ts`, `src/services/api.ts`, `src/services/supabase.ts`, `supabase/functions/parse-expense/index.ts`, `supabase/functions/fx-rate/index.ts`

## 작업

입력 흐름의 외부 호출 래퍼와 작성 중 지출 저장소, 훅을 만든다.

1. `src/services/storage.ts`
   ```ts
   // expo-image-picker 결과 uri → expo-image-manipulator로 긴 변 1600px, JPEG 0.8 재인코딩(EXIF·GPS 제거) → {room}/{expenseId}/{uuid}.jpg 업로드
   export async function preparePhoto(uri: string): Promise<{ uri: string }>;
   export async function uploadReceipt(roomId: string, expenseId: string, localUri: string): Promise<string>;   // storage_path
   export async function signedUrl(path: string): Promise<string>;   // 10분
   ```
   - 업로드 실패 → `UPLOAD_FAILED`. contentType `image/jpeg`만.
2. `src/services/api.ts`에 추가
   ```ts
   parseExpense(req: { roomId; kind: 'image'|'text'; storagePath?; text?; baseCurrency; roomStartDate? }, signal?: AbortSignal): Promise<ParseResult>;  // supabase.functions.invoke, 30초 타임아웃 → PARSE_TIMEOUT, 자동 재시도 없음
   fxRate(date: string, currency: string): Promise<FxRateResult>;
   saveExpense(payload: SaveExpensePayload, expectedVersion: number | null): Promise<{ id; version }>;
   recentExpenses(roomId: string, sinceIso: string): Promise<DupCandidate[]>;
   ackAiNotice(): Promise<void>;   // profiles.ai_notice_ack_at = now()
   ```
3. `src/services/drafts.ts`: 방마다 1건. JSON은 AsyncStorage `draft:{roomId}`, 사진은 `FileSystem.documentDirectory/drafts/{roomId}/`로 복사. `loadDraft/saveDraft/clearDraft`.
4. `src/hooks/useDraft.ts`: draft 상태 + 변경 시 디바운스 저장(500ms). `useSaveExpense()` mutation — 성공 시 draft 삭제, `['room', id, 'feed']`·`['rooms']` 무효화.
5. `src/hooks/useFxPreview.ts`: (date, currency) → `api.fxRate` 쿼리. 결과로 `toKrwPreview`.

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

- 원본 사진(EXIF 포함)을 업로드하지 마라. 반드시 manipulator 재인코딩 결과만. 이유: CLAUDE.md CRITICAL.
- `parseExpense`를 자동 재시도하지 마라. 이유: 비용(ARCHITECTURE §5.2).
- 작성 중 지출을 DB에 INSERT하지 마라. 이유: ADR-010.
- 오프라인 "올릴 지출" 큐를 만들지 마라. 이유: P1.
