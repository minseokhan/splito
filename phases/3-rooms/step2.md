# Step 2: room-screens

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` §1 화면 맵(내 여행 목록, 여행 만들기, 장부 홈), J1
- `/docs/UI_GUIDE.md` 카드, 버튼, 입력 필드, 상태 화면, 레이아웃
- `/docs/PRD.md` §6 F2(QR·카톡 공유·링크 복사)
- 이전 step 산출물: `src/services/api.ts`, `src/hooks/useRooms.ts`, `src/lib/invite.ts`, `src/lib/currency.ts`, `app/(app)/_layout.tsx`, `app/(app)/index.tsx`

## 작업

방 목록·만들기·장부 홈 뼈대·초대 화면을 만든다.

1. `app/(app)/index.tsx` 내 여행 목록: 탭 "진행 중"/"정산 완료"(status==='settled'), 카드(방 이름·기간·내 순잔액 `+`/`−` 부호와 "받을 돈/줄 돈"), 빈 상태, "+ 여행 만들기".
2. `app/(app)/rooms/new.tsx`: 이름·기본 통화(`CURRENCIES` 선택)·기간(선택) → `createRoom` → 장부 홈으로 replace. react-hook-form + zod.
3. `app/(app)/rooms/[roomId]/_layout.tsx`: Stack. (Realtime 구독은 5-ledger phase가 추가한다.)
4. `app/(app)/rooms/[roomId]/index.tsx` 장부 홈 뼈대: 상단 방 이름·상태 칩·총지출·내 순잔액(`my_rooms` 값), 초대 버튼, 1명이면 "모든 동행이 앱에 가입해야 정확히 나눠져요" 한 줄. 피드 자리는 빈 상태 문구("첫 지출을 올려보세요...")만. FAB는 4-expense-input phase가 추가한다.
5. `app/(app)/rooms/[roomId]/invite.tsx`: QR(`react-native-qrcode-svg`, `buildInviteUrl`), [카카오톡 공유](RN `Share.share` — OS 공유 시트), [링크 복사](`expo-clipboard`).
6. 표시 컴포넌트: `src/components/RoomCard.tsx`, `src/components/StatusChip.tsx`, `src/components/Money.tsx`(부호·라벨·tabular-nums, 스크린리더 라벨 "132,000원 받을 돈").
   - 금액 문자열 포맷은 `Intl.NumberFormat('ko-KR')`로 충분하다(정수 원).

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
3. 결과에 따라 `phases/3-rooms/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- Kakao 공유 SDK를 쓰지 마라. 이유: P1, OS 공유 시트로 대체(PRD F2.2).
- 방 설정·멤버 화면(`settings.tsx`, `members.tsx`)을 만들지 마라. 이유: 멤버 화면은 9-guest, 방 설정은 P1.
- 순잔액을 클라이언트에서 계산하지 마라. 이유: `my_rooms`/`room_balances`가 정답이다.
- 하늘색(`sky-800`) 배경 위에 흰 글자를 쓰지 마라. 이유: UI_GUIDE.
