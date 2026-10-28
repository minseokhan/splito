# Step 3: invite-deeplink

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §2(`+native-intent.tsx`, `i/[token].tsx`), §4 딥링크, §6.2
- `/docs/USER_FLOWS.md` J2 분기 A·B·D·E·F·G·H
- `/docs/UI_GUIDE.md` 바텀시트
- 이전 step 산출물: `src/lib/invite.ts`, `src/lib/entryRoute.ts`, `src/services/pendingInvite.ts`, `src/hooks/useRooms.ts`, `src/hooks/useAuth.tsx`, `app/index.tsx`

## 작업

초대 링크 진입 → 로그인(필요 시) → 합류 확인 시트 → 장부 홈 흐름을 만든다.

1. `app/+native-intent.tsx`: `redirectSystemPath`에서 `/i/{token}`(토큰이 `INVITE_TOKEN_RE` 통과)과 `/auth/callback`만 그대로, 나머지는 `/`.
2. `app/i/[token].tsx`: 토큰 검증 → `pendingInvite` 저장 → `/`로 replace(진입 분기는 `resolveEntryRoute`가 처리).
3. `app/index.tsx`: `{join: token}` 분기 → `/join/[token]`(아래 시트)로 이동.
4. `app/(app)/join/[token].tsx` 합류 확인 시트(모달 프레젠테이션)
   - `previewInvite` → "OO 여행에 참여할까요?" + 초대한 사람·인원 → [참여하기] → `joinRoom` → pending 삭제 → 장부 홈 replace.
   - `alreadyMember`면 시트 없이 바로 장부 홈(J2-D).
   - `INVITE_INVALID`면 "사용할 수 없는 초대예요. 초대한 분께 새 링크를 요청하세요" + pending 삭제.
   - 작성 중 지출이 있어도 그대로 둔다(J2-H — 작성 중 지출은 기기에 저장되므로 화면만 띄우면 된다).
5. 동의 거부·가입 중단 시에도 pending은 지우지 않는다(24시간 만료).

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
npx expo export -p android
npx expo prebuild --no-install --clean
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

- 시트 없이 자동 합류하지 마라. 이유: 잘못 누른 링크 방지(J2-A).
- `+native-intent`에서 허용 목록 밖 경로를 통과시키지 마라. 이유: ARCHITECTURE §4 딥링크.
- 클립보드 복원·Install Referrer를 만들지 마라. 이유: 8-install-join phase 범위.
