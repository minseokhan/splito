# Step 2: guest-screens

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` J9 전체, §1 방 메뉴 → 멤버
- `/docs/UI_GUIDE.md` 게스트 아바타(점선 테두리 1.5px `#5E7185`, "게스트" 칩)
- 이전 step 산출물: `src/lib/guestView.ts`, `supabase/migrations/*_guest.sql`, `src/components/Avatar.tsx`, `src/components/BalanceTable.tsx`, `src/components/TransferCard.tsx`, `app/(app)/rooms/[roomId]/expenses/review.tsx`, `app/(app)/rooms/[roomId]/invite.tsx`

## 작업

멤버 화면과 게스트 표시를 만든다.

1. `src/services/api.ts`: `addGuest`, `updateGuest`, `removeGuest`. 훅 `src/hooks/useGuests.ts`(성공 시 members·balances 무효화).
2. `app/(app)/rooms/[roomId]/members.tsx`: 멤버 목록(가입 멤버·게스트), [초대하기](invite 화면), [게스트 추가](이름 + 대표자 선택, 기본 나), 게스트 행 탭 → 이름 변경·대표자 변경(`repChangeWarning` 확인 시트)·삭제(`GUEST_IN_USE` 메시지).
3. 장부 홈에 방 메뉴(우상단) → "멤버" 진입.
4. `Avatar`에 `guest` prop: 점선 테두리 + 이름 옆 "게스트" 칩.
5. review 화면의 결제자·대상 인원·박스 지정 목록에 게스트가 나오는지 확인하고 게스트 표기를 적용한다(멤버 목록이 이미 room_members 전체라면 표기만).
6. 정산 화면: `orderBalanceRows` + `memberDisplayName`, 대표자 카드에 `guestShareNote`.

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
3. 결과에 따라 `phases/9-guest/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 게스트를 송금 카드·통장 주인·방장 후보에 넣지 마라. 이유: ADR-011.
- 멤버 내보내기·링크 재발급 버튼을 만들지 마라. 이유: F2.5는 P1.
