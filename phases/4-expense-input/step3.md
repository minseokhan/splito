# Step 3: money-lib

## 읽어야 할 파일

- `/docs/PRD.md` §7.1 계산(반올림), §7.2 금액 단위(최대 잔여 배분, floor, 자투리)
- `/docs/ADR.md` ADR-006 (JS와 PG의 음수 반올림 차이)
- `/docs/UI_GUIDE.md` 타이포그래피의 금액 표기·환율 근거 표기
- 이전 phase 산출물: `src/lib/currency.ts`, `supabase/migrations/*_save_expense.sql`(서버 배분 규칙과 같아야 한다)

## 작업

미리보기용 정수 원 연산과 금액 표기를 TDD로 만든다. 테스트 먼저(`src/lib/money.test.ts`).

`src/lib/money.ts`
```ts
export function roundHalfAwayFromZero(x: number): number;            // Math.round 금지(−2.5 → −2)
export function floorDiv(a: number, b: number): number;              // 음수도 floor
// 외화 원본(소수 최대 3자리)과 1단위 환율 → 원화 미리보기. 부동소수 오차를 피하려 정수 스케일(×1000, ×1e6)로 계산.
export function toKrwPreview(amountOriginal: number, ratePerUnit: number): number;
// 지출 원화를 박스 원본 금액 비율로 최대 잔여 배분. 동점이면 position 작은 순. 합은 정확히 total.
export function allocateLargestRemainder(totalKrw: number, items: { position: number; amount: number }[]): number[];
export function splitEvenly(boxKrw: number, n: number): { perPerson: number; remainder: number };   // floor, remainder ≥ 0
export function formatKrw(krw: number): string;                      // "132,000원"
export function formatForeign(amount: number, currency: string): string;  // "¥3,280", "$12.50"
export function fxBasisLabel(p: { source: FxSource; baseDate?: string; rate?: number; currency: string }): string;
// "10/21 매매기준율 · 1달러 = 1,328원", JPY·IDR은 "100엔 = 912.34원", 'krw' → "원화 결제", 'card_krw' → "승인 문자 청구액 · 승인 시점 금액", 'manual' → "수동 입력", 'pending' → "환율 대기"
```

테스트: `−2.5`·`2.5`·`0.4999` 반올림, floorDiv 음수, 배분 합 일치(무작위 100케이스), 동점 position 순, 음수 할인 박스, splitEvenly 음수 박스 remainder ≥ 0, 표기 문자열.

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
3. 결과에 따라 `phases/4-expense-input/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 이 결과를 저장값으로 쓰지 마라(미리보기 전용). 이유: 원화 확정은 서버 `save_expense`가 한다(CLAUDE.md CRITICAL).
- `Math.round`, `toFixed`로 금액을 반올림하지 마라. 이유: ADR-006.
- 금액 라이브러리(decimal.js, dinero 등)를 추가하지 마라. 이유: 정수 스케일로 충분하다.
