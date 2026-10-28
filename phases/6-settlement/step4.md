# Step 4: settle-screen

## 읽어야 할 파일

- `/docs/USER_FLOWS.md` J6 전체, §1 정산 탭
- `/docs/UI_GUIDE.md` 송금 카드, 시맨틱, 상태 화면(혼자인 방의 정산 탭·환율 대기·정산 후 장부 변경), 애니메이션(송금 완료 체크 300ms)
- `/docs/PRD.md` §6 F7·F8, §7.3(복사 시 클립보드 안내 1회)
- 이전 step 산출물: `src/hooks/useSettlement.ts`, `src/hooks/usePayoutAccount.ts`, `src/lib/settleView.ts`, `src/components/Money.tsx`, `src/components/Avatar.tsx`

## 작업

정산 화면 `app/(app)/rooms/[roomId]/settle.tsx`를 만들고 장부 홈에 진입점을 단다.

1. 장부 홈 상단에 [정산] 버튼(참여자 2명 이상일 때만, 게스트 포함).
2. 화면 진입 시 pending 지출이 있으면 `fxRate` → `reconfirmPendingFx` 1회. 그래도 남으면 상단 띠 "환율 대기 N건 제외 · 잠정 정산이에요" + [확인하기](장부 홈).
3. 1명이면 "동행을 초대하면 정산을 할 수 있어요" + 초대하기.
4. 사람별 표: 이름·낸 돈·부담액·순잔액(부호 + 받을 돈/줄 돈).
5. 송금 카드(`buildCards`): "민지 → 지훈" + 금액.
   - 계좌 줄: 내가 줄 사람이면 `getPayoutAccount` 원문, 아니면 마스킹, 미등록이면 "계좌 미등록 · [계좌 요청하기]".
   - 줄 사람: [복사](Secondary, 첫 복사 때 "다른 기기와 클립보드가 동기화될 수 있어요" 1회 — AsyncStorage 플래그) [보냈어요](Primary → 금액 수정 가능한 시트, 기본값 카드 금액).
   - 받을 사람: [받았어요](Primary — 기록이 없으면 받는 사람 명의로 기록 생성) [못 받았어요](Text).
   - 기록 상태 칩: 확인 대기 / 확인됨 / 취소됨 / 못 받음. 확인 전 내 기록에는 [취소].
6. 하단: `pendingConfirmSummary`, `ledgerChangedAfterTransfer` 배너.
7. 컴포넌트: `src/components/TransferCard.tsx`, `src/components/BalanceTable.tsx`.

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

- 토스·카카오페이 송금 바로가기를 만들지 마라. 이유: P2.
- 미정산 푸시 알림을 만들지 마라. 이유: P2.
- 계좌 원문을 콘솔·analytics에 남기지 마라. 이유: PRD §7.3.
- 방 나가기 UI를 만들지 마라. 이유: F9.1은 P1(RPC는 이미 있음).
