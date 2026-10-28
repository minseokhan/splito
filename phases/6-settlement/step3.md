# Step 3: settle-services

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §5.1 송금·계좌 RPC, §6.5, §7(쿼리 키 `['room', id, 'balances']`)
- 이전 step 산출물: `src/lib/matching.ts`, `src/lib/settleView.ts`, `supabase/migrations/*_payout.sql`, `supabase/migrations/*_transfers_leave.sql`, `src/services/api.ts`

## 작업

정산 RPC 래퍼와 훅을 만든다.

1. `src/services/api.ts`에 추가
   ```ts
   roomBalances(roomId, confirmedOnly = false): Promise<{ rows: BalanceRow[]; fxPendingCount: number }>;
   transfers(roomId): Promise<TransferRecord[]>;
   recordTransfer(input: { id: string; roomId; from; to; amount }): Promise<void>;   // id는 클라이언트 UUID(멱등)
   confirmTransfer(id), rejectTransfer(id), cancelTransfer(id): Promise<void>;
   setPayoutAccount(input), getPayoutAccount(roomId, ownerMemberId), requestPayoutAccount(roomId, ownerMemberId);
   ```
2. `src/hooks/useSettlement.ts`: `useBalances(roomId)`(`['room', id, 'balances']`), `useTransfers(roomId)`(`['room', id, 'transfers']`), `useSettlePlan(roomId)` = balances → `matchTransfers` → `buildCards`. 송금 mutation 성공 시 balances·transfers·`['rooms']` 무효화.
3. `useRealtimeRoom`의 transfers 이벤트가 `['room', id, 'transfers']`도 무효화하는지 확인하고 빠졌으면 추가.
4. `src/hooks/usePayoutAccount.ts`: 카드별 계좌 쿼리(`['payout', roomId, ownerMemberId]`).

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/6-settlement/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 송금 mutation을 낙관적 업데이트하지 마라. 이유: 금액은 서버 응답 후 반영(ARCHITECTURE §7).
- `transfers` 테이블에 직접 INSERT 하지 마라. RPC만.
