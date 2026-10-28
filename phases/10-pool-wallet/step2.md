# Step 2: pool-screens

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` J7 전체, §1 방 메뉴 → 공금 지갑(2명 이상)
- `/docs/PRD.md` §7.2 공금(통장 주인 변경 경고)
- 이전 step 산출물: `src/lib/pool.ts`, `supabase/migrations/*_pool.sql`, `app/(app)/rooms/[roomId]/expenses/review.tsx`, `app/(app)/rooms/[roomId]/settle.tsx`, 장부 홈 방 메뉴

## 작업

공금 지갑 화면과 결제자 '공금' 선택을 만든다.

1. `src/services/api.ts`: `setPool`, `upsertPoolDeposits`, `poolDeposits(roomId)`. 훅 `src/hooks/usePool.ts`(`['room', id, 'pool']`, Realtime의 pool_deposits·rooms 이벤트로 무효화되는지 확인).
2. `app/(app)/rooms/[roomId]/pool.tsx`: 공금 켜기/끄기(`POOL_IN_USE` 메시지), 통장 주인 선택(user만, 변경 시 "과거 상계도 새 주인 기준으로 바뀌어요" 경고), 사람별 입금액 입력 + [같은 금액 일괄 입력], 카드 끝자리 4자리 등록(선택). 남은 공금 표시.
3. 방 메뉴에 "공금 지갑"(참여자 2명 이상).
4. review 화면: 공금이 켜져 있으면 결제자 선택지에 '공금', `draftFromParse` 직후 `autoSelectPayer` 적용.
5. 정산 화면: 공금이 켜져 있으면 `poolNote` 설명을 통장 주인 카드 아래에.

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
3. 결과에 따라 `phases/10-pool-wallet/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 정산 화면에 공금을 별도 송금 대상으로 보여주지 마라. 이유: J7 3 — 통장 주인 송금에 합쳐진다.
- 게스트를 통장 주인 후보에 넣지 마라. 이유: ADR-011.
