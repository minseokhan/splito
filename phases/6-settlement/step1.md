# Step 1: settle-view-lib

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` J6 전체, §5 송금 기록 상태
- `/docs/UI_GUIDE.md` 송금 카드, 시맨틱(확인 대기·확인됨·무효), 상태 화면(정산 관련 3종)
- `/docs/PRD.md` §6 F8, §7.2 정산 확정과 변경, §7.3 계좌번호(마스킹 형식)
- 이전 step 산출물: `src/lib/matching.ts`, `src/lib/money.ts`

## 작업

정산 화면의 표시 모델을 TDD로 만든다. 테스트 먼저(`src/lib/settleView.test.ts`).

`src/lib/settleView.ts`
```ts
export type TransferRecord = { id: string; from: MemberId; to: MemberId; amount: Krw; confirmedAt: string | null; voidedAt: string | null; voidReason: 'cancelled'|'not_received'|null; createdAt: string };
export type CardRole = 'payer' | 'payee' | 'observer';   // 나 기준: 줄 사람 / 받을 사람 / 제3자
export type SettleCard = { from: MemberId; to: MemberId; amount: Krw; role: CardRole };
export function buildCards(transfers: Transfer[], me: MemberId): SettleCard[];      // 내 카드 먼저
export type RecordState = 'pending' | 'confirmed' | 'cancelled' | 'not_received';
export function recordState(r: TransferRecord): RecordState;
// 확인 대기 송금의 받을 사람 이름 목록: "확인 대기 2건 · 민지, 지훈"
export function pendingConfirmSummary(records: TransferRecord[], names: Record<string,string>): string | null;
// 송금 기록이 있고, 그 뒤에 지출이 바뀌었으면 true → "정산 후 장부가 변경되어 송금안이 갱신되었어요"
export function ledgerChangedAfterTransfer(records: TransferRecord[], lastExpenseUpdatedAt: string | null): boolean;
export function copyText(p: { toName: string; amount: Krw; bankName: string; accountNumber: string }): string;  // "지훈에게 132,000원 · 카카오뱅크 3333-01-1234567"
```

테스트: 역할 분류·정렬, 상태 4종, 요약 문구(0건이면 null), 변경 감지(무효 기록만 있으면 false), 복사 문구. (마스킹은 서버 `get_payout_account`의 `account_masked`를 그대로 쓴다.)

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

- 계좌번호 원문을 이 lib에서 만들거나 저장하지 마라. 원문은 서버 `get_payout_account`만 준다.
- '정산 완료' 판정을 클라이언트에서 하지 마라. 이유: 서버(`my_rooms`, `room_balances(…, true)`)만 판정한다(ARCHITECTURE §6.5).
