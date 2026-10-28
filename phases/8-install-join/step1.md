# Step 1: invite-restore

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §1 클립보드(`ClipboardPasteButton`), §4 딥링크(클립보드 값도 같은 정규식), §6.2
- `/docs/USER_FLOWS.md` J2 분기 C
- 이전 phase 산출물: `src/lib/invite.ts`(`extractInviteToken`), `src/services/pendingInvite.ts`, `app/(auth)/login.tsx`, `app/index.tsx`

## 작업

설치 후 첫 실행에서 초대를 복원한다.

1. `app/(auth)/login.tsx` 하단 "초대받으셨나요?" 영역
   - iOS 16+: `expo-clipboard`의 `ClipboardPasteButton`(권한 팝업 없음) → 붙여넣은 텍스트에서 `extractInviteToken`.
   - Android: [초대 링크 붙여넣기] 버튼 → `Clipboard.getStringAsync()`.
   - 둘 다 실패 대비: "초대 링크 붙여넣기" 입력칸 + [확인].
   - 토큰을 찾으면 `pendingInvite` 저장 + "초대를 확인했어요. 로그인하면 참여할 수 있어요" 표시. 못 찾으면 "초대 링크를 찾지 못했어요".
2. 로그인 후에는 기존 `resolveEntryRoute`의 `{join}` 분기가 처리하므로 추가 라우팅을 만들지 않는다.
3. 이미 로그인한 사용자를 위해 내 여행 목록 빈 상태에도 같은 입력을 둔다(`src/components/InvitePasteBox.tsx`로 공유).

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
3. 결과에 따라 `phases/8-install-join/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 앱 시작 시 클립보드를 자동으로 읽지 마라. 이유: iOS 붙여넣기 권한 팝업·개인정보 우려. 사용자 버튼으로만.
- 정규식 검증 없이 클립보드 값을 라우팅에 쓰지 마라. 이유: ARCHITECTURE §4.
- `expo-application` Install Referrer를 쓰지 마라. 이유: 스토어 출시 후 범위.
