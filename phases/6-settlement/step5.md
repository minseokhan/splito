# Step 5: payout-account-screen

## 읽어야 할 파일

- `/docs/PRD.md` §6 F1.3(받을 계좌 선택), F8.1
- `/docs/USER_FLOWS.md` J1 2단계, J6 3번(계좌 요청 → 등록 화면)
- `/docs/UI_GUIDE.md` 입력 필드, 버튼
- 이전 step 산출물: `src/services/api.ts`(`setPayoutAccount`), `app/(auth)/profile-setup.tsx`, `app/(app)/_layout.tsx`

## 작업

받을 계좌 등록 화면을 만든다.

1. `src/lib/bank.ts` (+ test 먼저): `BANKS`(코드·이름, 주요 은행·인터넷은행·증권 20여 개), `accountNumberSchema`(숫자·하이픈, 숫자 8~20자리).
2. `app/(app)/payout-account.tsx`: 은행 선택·예금주·계좌번호 → `setPayoutAccount`. 등록돼 있으면 은행명·마스킹 표시 후 수정.
3. `app/(auth)/profile-setup.tsx`에 "받을 계좌 등록(선택)" 버튼 → 등록 화면, [나중에] 유지.
4. 내 여행 목록 우상단 "내 정보" 자리에 계좌 등록 진입 버튼(내 정보 화면 전체는 P1이므로 계좌 진입만).

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
3. 결과에 따라 `phases/6-settlement/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 계좌번호를 AsyncStorage·draft·로그에 저장하지 마라. 이유: PRD §7.3.
- 회원 탈퇴·로그아웃·닉네임 수정 화면(`me.tsx`)을 만들지 마라. 이유: F9.2는 P1.
- 계좌 실명 확인 API를 연동하지 마라. 이유: 범위 밖.
