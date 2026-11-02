# intake-diff · 정산 결과 화면 핸드오프

- 받은 것: `Splito 로고 디자인 제안 (6).zip` → `splito-settlement/` (README.md · splito-tokens.json · settlement.html · assets/splito-symbol.svg)
- 유형: **디자인 핸드오프**
- 1차 소스: `settlement.html`(인라인 수치). README도 "수치가 이 문서와 다르면 HTML이 기준"이라고 명시. 토큰은 `splito-tokens.json`.
- 대상 코드: `app/(app)/rooms/[roomId]/settle.tsx`, `src/components/TransferCard.tsx`, `src/components/BalanceTable.tsx`, `src/lib/settleView.ts`, `src/lib/matching.ts`

## 값 diff (토큰)

| 값 | 핸드오프 | 코드 | 판정 |
|---|---|---|---|
| `#36B6FF` | tokens `primary` | `#5EC4FF` | **예외 기록됨** — 20261103-trip-detail-3a에서 이미 판정. 전역 `primary`는 유지, 그라데이션 시작색으로만 사용 |
| `#EEF7FF` | 세그먼트 탭 바탕 | 없음 | **미반영** — 신규 값. `sky-100`(#E6F6FF)보다 옅다. 탭 전용으로 추가 |
| `#ECEEF2` | 카드 테두리 | 없음 | **미반영** — `line`(#E4E7EC)과 육안 구분 가능. 카드 테두리 전용 |
| `#1E9BE8` / `#80C8F2` | 탭 숫자(선택/미선택) | 없음 | **미반영** — 신규 값 2개 |
| `#EEF2F6` | 목업 프레임 바깥 배경 | 없음 | 화면 요소 아님 → **제외** |
| `#FFFFFF` | surface | tailwind 기본 `white` | 반영됨(오탐) |
| 그 외 전 색상 | — | `src/theme/tokens.ts` | 반영됨 |
| radius 22 (송금 카드) | HTML 인라인 | `card` 20 / `card-lg` 24 | **예외** — 토큰 스케일 밖. 1차 소스가 HTML이므로 22를 쓰되 예외로 기록 |
| 멤버 tint/fg 4색 | tokens.json | `src/theme/tokens.ts:MEMBER_COLORS` | 반영됨 (`tokens.ts:24`) |

## 에셋 바이트 비교

| 파일 | 결과 |
|---|---|
| `assets/splito-symbol.svg` ↔ `assets/logo/svg/splito-symbol.svg` | **동일**(9,483B, metadata 제거 후 diff 0건) → 할 일 없음 |

## 존재 태깅 · 항목 판정

| # | 항목 | 판정 | 근거 | 조치 |
|---|---|---|---|---|
| 1 | 내비 "정산" 17/600 가운데 | 반영됨 | `settle.tsx:176` `<NavBar title="정산" align="center" />` | 없음 |
| 2 | 심볼 64 + 제목 20/600 + 부제 14 | 반영됨 | `settle.tsx:192-198` | 부제 색만 확인(#535764 = `ink-500`) |
| 3 | **세그먼트 탭 '보낼 돈(n)/받을 돈(n)'** | **코드에 없음(신규)** | 현재는 역할 구분 없이 카드 1열(`settle.tsx:206`) | 신규 구현 |
| 4 | 상태 배지 4종(송금 필요·확인 대기·입금 확인 필요·받았어요) | 부분반영 | `TransferCard`의 `role` + `settleView.recordState` | 배지 4종 매핑 신규, 색은 토큰에 있음 |
| 5 | 아바타 38 + 화살표 + 이름 12 #A0A4AE, 금액 24/600 | 부분반영 | `TransferCard.tsx` | 수치 조정 |
| 6 | **'상세 보기' 품목 내역(상대 결제 품목 / 본인 결제 품목)** | **데이터 없음(기능작업)** | `grep -rn "settlement_breakdown\|breakdown" app src supabase` → 0건. `room_balances`는 참여자별 `paid/owed` 합계만 반환(`balances_visibility.sql:6`) | **승격 — 사용자 결정 필요.** 품목×참여자 집계 RPC + pgTAP 필요 |
| 6b | 상세 합계 = 카드 송금액 | **다름(설계 충돌)** | 송금안은 그리디 최소 송금(`matching.ts:26`)이라 카드 금액이 두 사람 사이 순채무와 일반적으로 다르다. 프로토타입은 우연히 일치하는 값으로 작성됨 | **승격 — 사용자 결정 필요** |
| 7 | 계좌 박스(은행·번호·예금주·복사) | 반영됨 | `settle.tsx:285-300` `CardContainer`, `usePayoutAccount` | 레이아웃만 조정 |
| 8 | CTA 52h #131927 흰 글자 '보냈어요/받았어요' | 반영됨 | `PrimaryButton variant="dark"`, `TransferCard` | 수치 조정 |
| 9 | 받을 돈 카드 안내문 "○○님이 보냈다고 알려왔어요" | 코드에 없음(신규) | `settle.tsx:229-244`는 별도 `TransferRecordRow`로 분리 표시 | 카드에 합침 |
| 10 | 보냈어요/받았어요 후 상태 + '취소' | 부분반영 | `TransferRecordRow` + `useCancelTransfer` | 카드 안으로 이동 |
| 11 | **"다른 사람끼리의 송금은 표시하지 않음"** | **다름(동작 변경)** | 현재 `buildCards`가 `role: 'observer'` 카드를 그대로 렌더(`settleView.ts:21`, `settle.tsx:206`) | 사용자 결정 필요 |
| 12 | 순잔액 표(BalanceTable) | 시안에 없음 | `settle.tsx:246` | 사용자 결정 필요(시안대로면 제거) |
| 13 | 환율 대기 배너·장부 변경 배너·나만 보기 확인 단계·공금 안내 | 시안에 없음(정상 상태만 그림) | `settle.tsx:177-204, 224-227, 132-147` | **유지** — 시안에 없다고 지울 근거 없음 |

## 데이터 의존 UI

- **상세 보기 품목 내역** — 필요한 것: 지출별 품목(`expense_items`) × 지정 인원(`item_assignees`) × 대상 인원(`expense_scope`)을 **결제자-부담자 쌍으로** 집계. 현재 클라이언트는 지출 상세를 1건씩만 읽는다(`api.expenseDetail`). 방 전체를 품목 단위로 집계하는 경로는 서버·클라이언트 어디에도 없다 → 신규 RPC.
- 세그먼트 탭 카운트 — `buildCards`의 role로 계산 가능. 데이터 추가 불필요.
- 상태 배지 — `recordState` + `role`로 계산 가능. 데이터 추가 불필요.

## 프로토타입의 위조 데이터

`settlement.html`에는 스크립트 데이터 생성부가 없다(탭 전환·펼침 토글만, 숫자는 전부 하드코딩된 정적 마크업). 즉 **상세 보기의 품목 내역은 실재 데이터로 검증된 적이 없다** — 항목 6·6b의 근거.

## 범위 조정

- **제외** — 심볼 SVG 교체(동일), `#EEF2F6`(프레임 배경)
- **승격** — 항목 6(품목 내역 집계 RPC), 6b(그리디 매칭 vs 쌍방 순채무)
- **재설계** — 없음
- **추가(드리프트)** — 항목 11·12(시안이 명시적으로 빼거나 그리지 않은 기존 기능: 제3자 카드, 순잔액 표)

## 전역 불변식

- 토큰 값 diff: 위 표의 '미반영' 4색(`#EEF7FF`, `#ECEEF2`, `#1E9BE8`, `#80C8F2`)을 `tailwind.config.js` + `src/theme/tokens.ts`에 추가하면 `tokens.test.ts`가 두 파일 일치를 강제한다.

## 결정 (2026-11-03, 사용자)

| 항목 | 결정 | 결과 |
|---|---|---|
| 6·6b 상세 보기(품목 내역) | **이번 범위에서 제외** | '상세 보기' 토글을 빼고 나머지 디자인만 적용. 품목×참여자 집계 RPC는 별도 이슈로 분리(그리디 매칭 금액 ≠ 쌍방 순채무 문제도 그 이슈에서 함께 결정) |
| 11 제3자 송금 카드 | **시안대로 숨김** | `buildSettleItems`가 내가(또는 내 게스트가) 당사자인 건만 반환 |
| 12 순잔액 표(BalanceTable) | **시안대로 제거** | `src/components/BalanceTable.tsx` 삭제. 고아가 된 `guestView`의 `memberDisplayName`·`guestShareNote`·`orderBalanceRows`도 함께 삭제(되살리려면 이 커밋 이전 판본) |

## 적용 결과

- 새 색 4종을 `tailwind.config.js` + `src/theme/tokens.ts`에 추가(`tab.bg`·`tab.num`·`tab.num-off`·`card-line`) → `tokens.test.ts`가 두 파일 일치를 강제한다.
- 카드 radius 22는 토큰 스케일 밖이지만 1차 소스(HTML)를 따른다 — `rounded-[22px]`로 예외 기록.
- 상태 배지는 방향×상태 조합으로 정한다(`TransferCard.tsx`의 `BADGE`): send-need 송금 필요 / recv-need 받을 차례 / send-waiting 확인 대기 / recv-confirm 입금 확인 필요 / done 보냈어요·받았어요.
- 시안에 없지만 유지한 것: 환율 대기 배너, 장부 변경 배너, 나만 보기 확인 단계, 공금 안내 문구.
