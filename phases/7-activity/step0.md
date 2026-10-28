# Step 0: activity-lib

## 읽어야 할 파일

- `/docs/PRD.md` §6 F3.4, F3.6(방 활동 종류)
- `/docs/ARCHITECTURE.md` §3 `room_events`(kind 목록)·`comments`
- `/docs/USER_FLOWS.md` J1 5단계, J5, J6 3번, J10(방장 위임 공지)
- 이전 phase 산출물: `src/lib/feed.ts`, `src/lib/money.ts`

## 작업

방 활동 문구와 피드 병합을 TDD로 만든다. 테스트 먼저.

`src/lib/activity.ts` (+ test)
```ts
export type RoomEvent = { id: string; kind: 'join'|'leave'|'removed'|'guest_added'|'guest_rep_change'|'owner_change'|'pool_owner_change'|'payout_reveal'|'payout_request'|'transfer';
  actorId: string | null; targetMemberId: string | null; payload: Record<string, unknown>; createdAt: string };
// actor/target 이름을 받아 한 줄 문구. 예: join → "민지 님이 참여했어요", payout_reveal → "지훈 님이 정산을 위해 민지 님 계좌를 확인했어요",
// payout_request → "지훈 님이 민지 님께 계좌 등록을 요청했어요", owner_change → "방장이 민지 님으로 바뀌었어요", transfer → "민지 → 지훈 132,000원 보냈어요"
export function eventText(e: RoomEvent, names: Record<string, string>): string;
// 피드 섹션 안에서 지출과 이벤트를 createdAt 기준으로 섞는다. 이벤트는 생성 시각의 KST 날짜 섹션에 들어간다.
export function mergeActivity<T extends { createdAt: string; paidLocalDate: string }>(expenses: T[], events: RoomEvent[], roomStartDate: string | null): FeedSection<T | RoomEvent>[];
export const commentSchema: z.ZodString;   // trim 1~500자
```
테스트: kind 10종 문구, 탈퇴/나간 사람 이름 대체("탈퇴한 사용자"), 병합 정렬, 댓글 길이 경계.

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
3. 결과에 따라 `phases/7-activity/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 이벤트 문구에 계좌번호·금액 외 민감 정보를 넣지 마라. 이유: PRD §7.3.
- `groupFeed`의 기존 동작을 바꾸지 마라(새 함수로 감싼다). 이유: 기존 테스트 보존.
