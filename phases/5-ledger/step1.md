# Step 1: realtime-hooks

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §6.4 실시간 동기화 전체, §7 상태 관리(쿼리 키), §8(읽기 재시도)
- `/docs/ADR.md` ADR-002 트레이드오프(재연결 시 전체 무효화), ADR-010
- 이전 phase 산출물: `src/services/api.ts`, `src/services/queryClient.ts`, `src/hooks/useRooms.ts`, `app/(app)/rooms/[roomId]/_layout.tsx`

## 작업

방 단위 Realtime 구독과 피드·상세 쿼리 훅을 만든다.

1. `src/services/api.ts`에 추가
   ```ts
   feed(roomId): Promise<FeedRow[]>;                 // expenses(삭제 제외) + 결제자·기록자 + 배지 필드, 박스는 제외
   expense(expenseId): Promise<ExpenseDetail>;       // 지출 + 박스 + 지정 + 대상 인원 + 사진 경로
   expenseHistory(expenseId): Promise<HistoryRow[]>; // rpc expense_history
   deleteExpense(id, expectedVersion): Promise<void>;
   reconfirmPendingFx(roomId): Promise<number>;
   ```
2. `src/hooks/useRealtimeRoom.ts`
   - 채널 `room:{roomId}` 하나. `postgres_changes`: `expenses`, `comments`, `room_members`, `transfers`, `pool_deposits`, `room_events`는 `room_id=eq.{id}`, `rooms`는 `id=eq.{id}`.
   - 이벤트는 쿼리 **무효화에만** 쓴다: expenses → `['room', id, 'feed']`, `['room', id, 'balances']`, `['expense', row.id]`, `['rooms']` / comments → `['expense', expense_id, 'comments']` / room_members → `['room', id, 'members']` 등.
   - `AppState`가 active로 돌아오거나 채널이 재구독(`SUBSCRIBED` 재진입)되면 `['room', id]` 접두 전체 무효화.
   - 언마운트 시 `removeChannel`.
3. `app/(app)/rooms/[roomId]/_layout.tsx`에서 `useRealtimeRoom(roomId)` 호출.
4. `src/hooks/useFeed.ts`(`['room', id, 'feed']`), `src/hooks/useExpense.ts`(`['expense', id]`, `['expense', id, 'history']`), `useDeleteExpense()`.

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

- Realtime payload로 캐시를 직접 갱신(setQueryData)하지 마라. 무효화만. 이유: ARCHITECTURE §6.4.
- Broadcast 채널로 바꾸지 마라. 이유: P2.
- 방마다 테이블별 채널을 여러 개 만들지 마라. 이유: 채널 하나(§6.4).
