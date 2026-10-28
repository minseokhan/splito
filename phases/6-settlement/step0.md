# Step 0: matching-lib

## 읽어야 할 파일

- `/docs/PRD.md` §6 F7 예시 2개, §7.2 최소 송금 매칭
- `/docs/ARCHITECTURE.md` §6.5 정산, §9 속성 테스트 행
- `/docs/ADR.md` ADR-007
- 이전 phase 산출물: `src/types/domain.ts`(`BalanceRow`), `supabase/migrations/*_room_balances.sql`

## 작업

순잔액 → 송금안 그리디 매칭을 TDD로 만든다. 테스트 먼저(`src/lib/matching.test.ts`).

`src/lib/matching.ts`
```ts
export type Transfer = { from: MemberId; to: MemberId; amount: Krw };
// kind='user' 행만 매칭한다(게스트는 net=0으로 대표자에 이미 합산되어 온다).
// 매 단계 남은 잔액으로 다시 정렬해 최대 채권자와 최대 채무자를 min(두 금액)으로 짝짓는다.
// 동점이면 joinedAt 오름차순 → memberId 사전순. Σnet ≠ 0이면 throw.
export function matchTransfers(rows: BalanceRow[]): Transfer[];
```

테스트
- PRD F7 예시 1 → D→A 300000, C→B 100000 (정확히 이 두 건, 순서 포함)
- PRD F7 예시 2(서버가 계산한 net 입력) → B→A 105000, C→A 5000, D→A 5000
- 모두 0 → 빈 배열, 1명 방 → 빈 배열
- 속성 테스트(시드 고정 PRNG로 500개 무작위 방, 2~10명, 정수 net, Σ=0): 송금 ≤ (0 아닌 사람 수 − 1), 송금 적용 후 전원 0, 입력 순서를 섞어도 결과 동일, 모든 amount > 0
- 게스트 행(net 0)이 섞여도 결과에 나오지 않음

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

- 순잔액을 TS에서 다시 계산하지 마라. 입력은 서버 `room_balances` 결과다. 이유: CLAUDE.md CRITICAL.
- `fast-check` 등 새 테스트 의존성을 추가하지 마라. 시드 고정 PRNG(mulberry32 등 몇 줄)로 충분하다.
- 최소 횟수 최적 해법(부분집합 탐색)을 구현하지 마라. 이유: PRD §7.2 — 그리디, N−1회 보장만.
