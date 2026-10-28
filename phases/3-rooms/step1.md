# Step 1: room-services

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §5.1(`create_room`, `preview_invite`, `join_room`, `my_rooms`, `update_room`, `rotate_invite`), §7 상태 관리(쿼리 키)
- 이전 phase 산출물: `src/services/supabase.ts`, `src/services/queryClient.ts`, `src/types/database.ts`, `src/types/domain.ts`, `src/lib/invite.ts`, `src/lib/errors.ts`

## 작업

방 RPC 래퍼와 Query 훅, 대기 초대 저장소를 만든다.

1. `src/services/api.ts` — RPC 타입 래퍼. 에러는 `toUserError`로 바꿔 throw.
   ```ts
   export const api = {
     createRoom(input: { name: string; baseCurrency: string; startDate?: string; endDate?: string }): Promise<RoomId>;
     previewInvite(token: string): Promise<{ roomId: RoomId; roomName: string; inviterNickname: string; memberCount: number; alreadyMember: boolean }>;
     joinRoom(token: string): Promise<RoomId>;
     myRooms(): Promise<MyRoom[]>;
     roomMembers(roomId: RoomId): Promise<RoomMember[]>;   // room_members + member_profiles SELECT
     room(roomId: RoomId): Promise<Room>;                 // rooms SELECT (invite_token 포함)
   };
   ```
   이후 phase가 이 객체에 함수를 추가한다.
2. `src/services/pendingInvite.ts`: SecureStore 키 `pending_invite`에 `PendingInvite` JSON 저장·조회·삭제. 조회 시 `isPendingInviteValid`로 만료면 삭제 후 null.
3. `src/hooks/useRooms.ts`: `useMyRooms()`(키 `['rooms']`), `useRoom(id)`(키 `['room', id]`), `useRoomMembers(id)`(키 `['room', id, 'members']`), `useCreateRoom()`, `useJoinRoom()` — 성공 시 `['rooms']` 무효화.

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
3. 결과에 따라 `phases/3-rooms/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `supabase.from('rooms').insert(...)` 등 장부 테이블 직접 쓰기를 하지 마라. 이유: RPC로만 쓴다(CLAUDE.md CRITICAL).
- mutation에 자동 재시도를 켜지 마라. 이유: ARCHITECTURE §8.
