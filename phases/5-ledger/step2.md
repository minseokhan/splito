# Step 2: feed-screen

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` §1 장부 홈(배너 영역, 피드 행)
- `/docs/UI_GUIDE.md` 카드(지출 카드), 배지, 상태 화면(빈 피드, 오프라인), 애니메이션(새 항목 페이드인 200ms)
- 이전 step 산출물: `src/hooks/useFeed.ts`, `src/hooks/useRealtimeRoom.ts`, `src/lib/feed.ts`, `src/lib/money.ts`, `app/(app)/rooms/[roomId]/index.tsx`(뼈대·FAB·draft 배너)

## 작업

장부 홈의 피드를 완성한다.

1. `rooms/[roomId]/index.tsx`: `SectionList` + `groupFeed`. 빈 피드 문구 유지. 당겨서 새로고침.
2. 배너 영역: 작성 중 지출 1건(기존), "환율 대기 N건"(feed의 pending 수) → 탭 시 `fxRate`로 캐시 채우기 시도 후 `reconfirmPendingFx`.
3. `src/components/ExpenseCard.tsx`: 1행 가맹점·원화(pending이면 외화 원본 + "환율 대기"), 2행 결제자 아바타·시각·입력 방식 아이콘(lucide: Camera·MessageSquare·Mic·Pencil)·`payerRecorderLabel`·외화 원본, 배지 줄(확인 필요/환율 대기). 탭 → 상세.
4. 오프라인 띠(`@react-native-community/netinfo`는 추가하지 말고, 쿼리 에러 코드가 `OFFLINE`일 때만 표시).

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

- 피드에서 순잔액·분담을 계산하지 마라. 이유: 서버 `room_balances`만 정답.
- 피드 중복 의심 배지·안 읽은 댓글 점을 만들지 마라. 이유: P1.
- 방 활동(room_events) 행을 이 step에서 섞지 마라. 이유: 7-activity phase 범위.
