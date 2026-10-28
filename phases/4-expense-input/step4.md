# Step 4: duplicate-lib

## 읽어야 할 파일

- `/docs/PRD.md` §6 F4 중복 기준(같은 방, 금액 ±20%, 결제 시각 2시간 이내 또는 같은 날, 가맹점명 유사)
- `/docs/ARCHITECTURE.md` §6.3(최근 72시간 지출과 비교)
- `/docs/USER_FLOWS.md` J3 중복 의심 배너
- 이전 step 산출물: `src/lib/money.ts`

## 작업

중복 후보 점수를 TDD로 만든다. 테스트 먼저(`src/lib/duplicate.test.ts`).

`src/lib/duplicate.ts`
```ts
export type DupCandidate = { id: string; merchant: string | null; paidLocalDate: string; paidLocalTime: string | null;
  currency: string; amountOriginal: number; krwAmount: number | null; createdAt: string };
export function normalizeMerchant(s: string | null): string;          // 소문자, 공백·기호 제거, 전각→반각
export function merchantSimilarity(a: string | null, b: string | null): number;   // 0~1 (포함 관계 또는 bigram Dice)
// draft와 최근 지출들을 비교해 가장 그럴듯한 후보 1건(없으면 null). 기준을 모두 만족해야 후보.
export function findDuplicate(draft: Omit<DupCandidate, 'id'|'createdAt'>, recent: DupCandidate[], now: Date): DupCandidate | null;
```
- 금액 비교: 같은 통화면 원본 금액, 다르면 krw(둘 다 있을 때만). ±20%.
- 시각: 둘 다 시각이 있으면 2시간 이내, 아니면 같은 날.
- 가맹점: 유사도 ≥ 0.5. 한쪽이 null이면 금액·시각만으로 판단하지 않는다(후보 아님).
- 최근 72시간(createdAt 기준) 밖은 제외.

테스트: 기준 각각의 경계(±20%, 2시간, 같은 날), 다른 통화 krw 비교, 가맹점 표기 차이("ICHIRAN 道頓堀" vs "이치란"은 후보 아님 / "Ichiran Dotonbori" vs "ICHIRAN DOTONBORI"는 후보), 72시간 밖 제외, 여러 후보 중 점수 최고.

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

- 자동으로 합치는 로직을 만들지 마라. 이유: PRD F4 — 제안만 한다.
- 피드 저장 후 중복 감지를 만들지 마라. 이유: P1.
