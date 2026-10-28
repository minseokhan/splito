# Step 1: guest-view-lib

## 읽어야 할 파일

- `/docs/PRD.md` §7.2 게스트(사람별 표 표기)
- `/docs/UI_GUIDE.md` 게스트 아바타("엄마(게스트 · 대표 민지)", "엄마 몫 포함")
- `/docs/USER_FLOWS.md` J9 3~4
- 이전 phase 산출물: `src/lib/settleView.ts`, `src/lib/matching.ts`, `src/types/domain.ts`

## 작업

정산 표시에 게스트 표기를 추가한다. 테스트 먼저(`src/lib/guestView.test.ts`).

`src/lib/guestView.ts`
```ts
// "엄마(게스트 · 대표 민지)"
export function memberDisplayName(row: BalanceRow, names: Record<MemberId, string>): string;
// 대표자 카드 보조 문구: 대표하는 게스트 이름들 → "엄마 몫 포함" / "엄마·아빠 몫 포함". 없으면 null.
export function guestShareNote(representativeId: MemberId, rows: BalanceRow[], names: Record<MemberId, string>): string | null;
// 대표자 변경 경고: "엄마의 정산 금액이 지훈 님에게 옮겨져요"
export function repChangeWarning(guestName: string, newRepName: string): string;
// 표 정렬: user 행 다음에 그 사람이 대표하는 게스트 행
export function orderBalanceRows(rows: BalanceRow[]): BalanceRow[];
```
테스트: 표기 문자열, 게스트 여러 명, 대표자가 나간 경우 이름 유지, 정렬.

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
3. 결과에 따라 `phases/9-guest/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 게스트 net을 클라이언트에서 대표자에게 다시 더하지 마라. 이유: 서버 `room_balances`가 이미 합산했다(이중 합산).
