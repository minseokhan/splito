# Step 1: pool-lib

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` J7 2~3
- `/docs/PRD.md` §7.2 공금
- 이전 phase 산출물: `src/lib/expenseForm.ts`, `src/lib/money.ts`

## 작업

공금 관련 순수 로직을 TDD로 만든다. 테스트 먼저(`src/lib/pool.test.ts`).

`src/lib/pool.ts`
```ts
// 인식된 카드 끝자리가 공금 카드 목록과 일치하면 결제자를 pool로. 공금이 꺼져 있거나 불일치면 그대로.
export function autoSelectPayer(draft: ExpenseDraft, pool: { enabled: boolean; cardLast4: string[] }): ExpenseDraft;
// "남은 공금 100,000원은 B 님이 돌려줄 금액에 포함됐어요" / "부족한 공금 N원은 B 님이 받을 금액에 포함됐어요" / 0이면 null
export function poolNote(remainingKrw: number, ownerName: string): string | null;
export function poolRemaining(depositsKrw: number[], poolSpentKrw: number[]): number;
// "같은 금액 일괄 입력": 모든 참여자에게 같은 금액
export function fillEqual(memberIds: string[], amountKrw: number): { memberId: string; amountKrw: number }[];
```
테스트: 끝자리 일치·불일치·공금 꺼짐, 문구 부호별, 잔액 계산, 일괄 입력.

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
3. 결과에 따라 `phases/10-pool-wallet/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 공금 상계를 클라이언트 순잔액에 반영하지 마라. 이유: 서버 `room_balances`가 이미 반영한다. `poolRemaining`은 설명 문구용이다.
