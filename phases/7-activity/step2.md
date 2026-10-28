# Step 2: activity-feed

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` §1 장부 홈 피드, J6 3번(계좌 요청 탭 → 계좌 등록)
- `/docs/UI_GUIDE.md` 본문·보조 타이포그래피(시스템 메시지는 보조 스타일)
- 이전 step 산출물: `src/lib/activity.ts`, `app/(app)/rooms/[roomId]/index.tsx`, `src/hooks/useFeed.ts`, `src/hooks/useRealtimeRoom.ts`, `app/(app)/payout-account.tsx`

## 작업

장부 홈 피드에 방 활동을 섞는다.

1. `src/services/api.ts`: `roomEvents(roomId)`(room_events SELECT, 최근 200건).
2. `src/hooks/useRoomEvents.ts`(`['room', id, 'events']`). `useRealtimeRoom`에 room_events → 이 키 무효화(빠졌으면 추가).
3. 피드를 `mergeActivity`로 렌더. 이벤트 행은 `src/components/ActivityRow.tsx`(가운데 정렬 13 ink-500, 카드 아님).
4. 나에게 온 `payout_request`이고 내 계좌가 미등록이면 행 탭 → `/payout-account`.

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
3. 결과에 따라 `phases/7-activity/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 클라이언트에서 `room_events`를 INSERT 하지 마라. 이유: RPC 안에서만 생성(ARCHITECTURE §3).
- 이벤트를 별도 "알림 탭" 화면으로 만들지 마라. 이유: 피드 시스템 메시지로 충분하다.
