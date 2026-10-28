# Step 1: comments

## 읽어야 할 파일

- `/docs/PRD.md` §6 F3.4
- `/docs/ARCHITECTURE.md` §3 comments, §4(comments는 직접 INSERT 예외), §7(낙관적 업데이트는 댓글에만)
- `/docs/USER_FLOWS.md` J5
- 이전 step 산출물: `src/lib/activity.ts`(`commentSchema`), `app/(app)/rooms/[roomId]/expenses/[expenseId].tsx`, `src/hooks/useRealtimeRoom.ts`, `supabase/migrations/*_schema.sql`(comments RLS)

## 작업

지출 상세에 댓글을 단다.

1. `src/services/api.ts`: `comments(expenseId)`, `addComment({id, expenseId, roomId, body})`(comments 직접 INSERT — 클라이언트 UUID), `deleteComment(id)`(본인 행 `deleted_at` UPDATE).
2. `src/hooks/useComments.ts`: `['expense', id, 'comments']`. `useAddComment`는 **낙관적 업데이트**(실패 시 롤백 + 에러 문구).
3. 상세 화면 하단 댓글 목록(작성자·시각·본문, 본인 댓글 삭제) + 입력창(키보드와 함께 올라감).
4. `useRealtimeRoom`의 comments 이벤트가 해당 지출 댓글 키를 무효화하는지 확인.
5. pgTAP 보강 `supabase/tests/070_comments.test.sql`: 남의 댓글 UPDATE 거부, 501자 거부, 비멤버 INSERT 거부.

## Acceptance Criteria

```bash
supabase db reset && supabase test db
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

- 안 읽은 댓글 점을 만들지 마라. 이유: P1.
- 댓글 푸시 알림을 만들지 마라. 이유: P2.
- 댓글 수정(본문 편집) 기능을 만들지 마라. 이유: 명세에 없다(삭제만).
