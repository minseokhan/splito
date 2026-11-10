# intake-diff — 전체 리브랜딩 핸드오프 (2026-11-04)

## Phase 0 — 유형과 1차 소스

| 항목 | 값 |
|---|---|
| 산출물 유형 | 디자인 핸드오프(전면) + 기능 명세 + 변경 목록(노션 25~29) |
| 전달물 | `Splito 로고 디자인 제안 (9).zip` → `splito-full-handoff/`, `랜딩 애니매이션_뉴.zip` → `splito-landing-animation/`, 노션 캡처 6장, `내 통계 명세서.md` |
| **1차 소스** | `prototype/Splito App.dc.html`(1a 섹션, 인라인 style + `class Component`), `tokens/splito-tokens.json`, `screens/01~18-*.png`, `prototype/assets/splito-mark*.svg`, `splito-landing-*.svg`의 `<style>` |
| 산문 요약(1차 소스 아님) | `README.md`, `COLORS.md`, `specs/*.md` |
| 사용자 추가 지시 | ① 지출 추가 3칸 칩은 **시안이 아니라 현재(가운데 정렬) 유지** ② 구조가 안 바뀐 것은 새로 만들지 말고 수정만 |

> `COLORS.md`는 **낡았다** — "반짝 지갑 A′"(지갑 심볼)를 기술하는데, 1차 소스(`splito-mark.svg`·screens)는
> 전부 새 **S + 삼각형 + 별** 마크다. 산문과 1차 소스가 어긋나므로 1차 소스가 이긴다.

---

## Phase 2-A — 값 diff (`tokens/splito-tokens.json` ↔ `tailwind.config.js` / `src/theme/tokens.ts`)

**이번 핸드오프의 가장 큰 변경은 대표색이다. 하늘색 → 네이비.**

| # | 토큰 | 핸드오프 | 코드 | 판정 |
|---|---|---|---|---|
| T1 | `primary` | **`#1D3C8F`** | `#5EC4FF` | **미반영(전역)** — 37개 파일이 `primary*`를 참조 |
| T2 | `primarySoft` | `#E8EEF8` | `sky-100` `#E6F6FF` | 미반영 |
| T3 | `primarySoft2` | `#DCE4F3` | 없음 | 미반영(신규) |
| T4 | `primaryBorder` | `#C2CFE8` | `sky-200` `#B8E5FF` | 미반영 |
| T5 | `bgAlt` | `#F3F6FB` | `sky-50` `#F5FBFF` | 미반영 |
| T6 | `inkAlt` | `#0E2A47` | `Logo.tsx`에 하드코딩 | 부분반영 → 토큰화 |
| T7 | `textBody` | `#353A47` | `ink-700` 동일 | 반영됨 |
| T8 | `yellow.accent` | `#C98A00` | 없음 | 미반영(신규, 내 통계 전용) |
| T9 | `yellow.bar` | `#F2B705` | 없음 | 미반영(신규, 내 통계 전용) |
| T10 | `cardBorder` `#ECEEF2` | — | `card-line` 동일 | 반영됨 |
| T11 | `member.민지` | tint `#E8EEF8` / fg `#1D3C8F` | `#E6F6FF` / `#0874BB` | 미반영 |
| T12 | `member` 나머지 3색 | — | 동일 | 반영됨 (`tokens.ts:28-31`) |
| T13 | `ink`·`bgApp`·`surfaceMuted`·`border`·`danger`·`mint`·`localCurrency`·`kakao`·`naver` | — | 동일 | 반영됨 |
| T14 | `radius` 8종 | — | 동일 | 반영됨 (`tailwind.config.js:33-40`) |
| T15 | `size` 9종 | — | 동일 | 반영됨 |
| T16 | `type` 스케일 | — | 토큰 없음(인라인 `text-[Npx]`) | 기존 관례 — 범위 밖 |

→ **`primary`가 네이비가 되면 `primary-on`(글자색)이 뒤집힌다.** 현재 CLAUDE.md 규칙
"하늘색 primary 위에 흰 글자 금지(글자는 primary-on)"는 값만 바꾸면 자동으로 성립한다
(`primary-on` = `#FFFFFF`). 규칙 문장은 UI_GUIDE와 함께 갱신해야 한다.

## Phase 2-B — 에셋 바이트 비교

| # | 에셋 | 판정 | 근거 |
|---|---|---|---|
| A1 | `assets/logo/svg/*.svg` 10종 | **반영됨(바이트 동일)** | `cmp` 전부 SAME — 단, 이것들은 **구 지갑 심볼**이다 |
| A2 | `assets/logo/png/*.png` 19종 | **반영됨(바이트 동일)** | `cmp` 전부 SAME — 동일하게 구 심볼 |
| A3 | `colors.json` / `COLORS.md` | 반영됨(동일) | 둘 다 구 심볼 기준 → **낡은 문서** |
| A4 | **`prototype/assets/splito-mark.svg`** | **코드에 없음(신규)** | 새 마크. `#1E4FD8→#0E1B3D` 그라데이션 + 금색 별 3개 `#FFE27A→#FFB020` |
| A5 | `prototype/assets/splito-mark-tile.svg` | 코드에 없음(신규) | A4 + 흰 타일 `rx 23` |
| A6 | `splito-landing-icon.svg` / `-symbol.svg` | 코드에 없음(신규) | A4·A5 + `<style>` 키프레임 5종 |
| A7 | `splito-wordmark.svg` | 반영됨 | `Logo.tsx:WORDMARK` path 동일, fill `#0E2A47` |
| A8 | `assets/icons/flight/*` | 반영됨 | `FlightIcon.tsx:7`과 path 동일 |

> **구 심볼(`SplitoSymbol`)은 폐기 대상이다.** 호출부 4곳: `login.tsx`(히어로),
> `payout-account.tsx:146`, `settle.tsx:98,175,412`, `RoomCard.tsx:35`(배경 워터마크).
> 노션 25번 "뉴 로고 반영된 곳 >> 랜딩, 계좌, 정산"과 28번 "배경 로고 없앰"이 이 4곳과 1:1로 맞는다.

## Phase 2-C — 존재 태깅 (노션 변경 목록 25~29)

| # | 항목 | 판정 | 근거 `파일:행` | 조치 |
|---|---|---|---|---|
| 25a | 랜딩 문구 "동행과 함께 쓰는 AI 정산 서비스" + 워드마크 + 2줄 설명 | **미반영** | `app/(auth)/login.tsx` | 문구·레이아웃 교체 |
| 25b | 랜딩 애니메이션(타일 pop → S → 삼각형 → 별 → 텍스트 6단 rise) | **코드에 없음(신규)** | `AnimatedSymbol.tsx`는 **구 심볼의 카드 pop**만 있음 | 새 마크용 애니메이션 재구현 |
| 25c | 새 로고 → 받을 계좌 카드 | **다름** | `payout-account.tsx:146` `SplitoSymbol size={124}` | 새 마크로 교체 |
| 25d | 새 로고 → 정산 화면 | **다름** | `settle.tsx:98,175,412` `SplitoSymbol size={64}` | 새 마크로 교체 |
| 26a | 패키지 결제 박스 맨 위 회색 글씨("여행 전 지출" 합계행) 삭제 | **미반영** | `ScheduleSection.tsx`(여행 전 그룹 헤더/합계) | 삭제 |
| 26b | 패키지 결제 박스에서 배지(`자동 등록`·`예산 제외`) 삭제 | **미반영** | `index.tsx:45` `FLAG_LABEL`, `prepay.tsx:29-30` | 배지 제거 |
| 26c | 여행 상세 상단 전면 개편(흰 배경 + 기간 pill + 내가 보낼 돈 박스 + 3액션) | **다름(대폭)** | `index.tsx:220-260` 그라데이션 히어로 | 재구성 |
| 26d | 액션 3칸이 `공금 지갑 / 내 통계 / 초대하기`로 변경(정산은 박스 안 버튼으로) | **부분반영** | `index.tsx` 현재 `정산/공금/초대` | 재배치 + **내 통계 신규** |
| 26e | `일정표 | 지출 내역` 토글 | **코드에 없음(신규)** | `grep "지출 내역"` → 0건 | 신규 |
| 26f | 우측 `카테고리 ▾` 드롭다운(전체/식비/쇼핑/관광/숙소/교통/기타) | **부분반영** | `index.tsx:200` 가로 칩 스크롤 | 드롭다운으로 교체. 데이터는 있음 |
| 26g | 기간 선택 pill `전체 기간 · 10.20 – 10.23 ▾` | **다름** | `index.tsx:DayPicker` 밑줄 탭 | 교체 |
| 26h | 구분선 아래 배경색 흰색/회색 | **질문(기획자)** | — | **사용자 결정 필요** |
| 27a | 헤더 "선결제 등록" → "패키지 여행 등록" | **미반영** | `prepay.tsx:89` | 문자열 교체 |
| 27b | 패키지 결제 박스의 배지 + "항공·숙박이 포함된 금액이라…" 삭제 | **미반영** | `prepay.tsx:29-30,123` | 삭제 |
| 28a | 품목 박스 X 버튼 위치(박스 우상단 바깥) · 쪼개기 아이콘 추가 | **다름** | `ItemBox.tsx:203` 쪼개기 텍스트만 | 수정 |
| 28b | 홈 카드 배경 워터마크 로고 제거 | **미반영** | `RoomCard.tsx:35` `SplitoSymbol opacity=.175` | 삭제 |
| 28c | 홈 카드 `패키지` 배지 | **데이터 없음** | `my_rooms()`가 예약 여부를 안 내려줌 (`20261101172427_balances_visibility.sql:85`) | **마이그레이션 필요** |
| 28d | 홈 카드 비행기 아이콘 → 국가 이모지 | **데이터 없음** | `rooms`에 국가·이모지 컬럼 없음 (`20261029000000_schema.sql:35-48`) | **사용자 결정 필요** |
| 28e | 홈 카드 제목에서 "N일" 제거 | **미반영** | `RoomCard.tsx` | 문자열 |
| 28f | 홈 카드 박스 안 텍스트 구성 변경(`정산 중 · JPY` 배지 / 날짜·인원 / 내가 보낼 돈) | **다름** | `RoomCard.tsx` | 재구성 |
| 29 | 내 통계 · 예산 설정 · AI 코칭 · 조정안 시트 | **데이터 없음(기능작업 전부)** | `grep -ri "예산\|budget" app src supabase` → 0건 | **승격 — 사용자 결정 필요** |
| U1 | 지출 추가 3칸 칩 | **반영됨(현행 유지)** | `expenses/new.tsx` 가운데 정렬 | 사용자 지시로 시안 무시 |

## Phase 2-D — 데이터 의존 UI

| UI | 필요한 필드 | 스키마 확인 | 판정 |
|---|---|---|---|
| 카테고리 드롭다운(26f) | `expenses.category` | `20261101172517_expense_category.sql` 존재, `CATEGORIES` 6종 | **있음** |
| 홈 `패키지` 배지(28c) | 방별 예약 존재 여부 | `trip_bookings` 테이블은 있으나 `my_rooms()` 미노출 | **RPC 수정 필요(마이그레이션 1건)** |
| 홈 국가 이모지(28d) | 국가 코드 | 없음. `rooms.base_currency`만 있음 | **결정 필요** |
| 내 통계 전부(29) | `trip_budget` 테이블, 일자별·카테고리별·참여자별 집계, 적용 조정안 | 전부 없음 | **승격** |
| 내 통계 '동행별 지출'(§6-3) | 참여자별 paid/share | `room_balances`가 이미 제공 | 있음 |
| 내 통계 '카테고리별'(§6-2) | 내 몫 × 카테고리 | `expense_shares` + `category` 조합 집계 RPC 필요 | 승격 |
| 정산 '상세 보기' 품목 내역 | 품목×참여자 집계 | 없음 — `20261103-settlement.md` #6에서 이미 승격 판정, 미해결 | **여전히 승격(보류)** |

## Phase 2-E — 프로토타입 위조 데이터

`class Component`의 `ms.*`(내 통계), `PKG_DAYS`, `SCHED`, 예산 상태 전환 버튼은 전부 하드코딩
데모 스위치다. 응원 문구 4종·조정안 2~3안도 고정 문자열이다 → **이 데이터는 실재하지 않는다.**

## Phase 3 — 전역 불변식 (완료 판정)

```bash
# 1) 구 하늘색 primary 가 코드에서 사라졌는가
grep -rnE "#5EC4FF|#0874BB|#E6F6FF|#B8E5FF|#F5FBFF" app src tailwind.config.js | wc -l   # → 0
# 2) 구 지갑 심볼 호출부가 남아 있는가
grep -rn "SplitoSymbol" app src | wc -l                                                   # → 0
# 3) 삭제 대상 문자열
grep -rn "선결제 등록\|항공·숙박이 포함된" app src | wc -l                                # → 0
```

## Phase 4 — 범위 조정

- **제외(할 일 없음)**: 로고 에셋 파일 복사(A1·A2 바이트 동일), radius·size·대부분 색 토큰,
  멤버 색 3종, 비행기 아이콘, 지출 추가 3칸 칩(U1 — 사용자 지시로 현행 유지).
- **승격(사용자 결정)**: ① **내 통계 전체(29)** — DB 테이블 + 집계 RPC + RLS + pgTAP + AI 코칭
  Edge Function + 화면 2개 + 시트. 디자인 작업이 아니라 독립 phase 규모다.
  ② **국가 이모지(28d)** — 국가 데이터가 없다. ③ 정산 '상세 보기' 품목 내역(이전 세션에서 이미 승격, 미해결).
- **재설계**: 26c·26d·26f·26g는 "값을 고쳐라"가 아니라 여행 상세 상단의 **구조 교체**다.
  `AvatarStack`·`FlightIcon`·`ScheduleSection`은 유지하고 배치만 바꾼다.
- **추가(드리프트 — 사용자 목록에 없음)**:
  - **전역 대표색 네이비 전환(T1~T5, T11)** — 25번이 "뉴 로고"만 말했지만 토큰과 18장 전부가
    네이비다. 37개 파일 영향.
  - `COLORS.md`·`colors.json`·`docs/UI_GUIDE.md`가 구 심볼·구 primary 기준으로 **낡았다**.
  - 홈 `패키지` 배지(28c)는 마이그레이션 1건을 동반한다.

---

## Phase 4-b — 사용자 결정 (2026-11-04)

| 질문 | 결정 |
|---|---|
| 내 통계(29) 범위 | **전부 구현** — 마이그레이션 + 집계 RPC + pgTAP + 화면 2개 + AI 코칭 Edge Function |
| 28d 국가 이모지 | **`base_currency`에서 유도** (`src/lib/flag.ts`). 매핑에 없으면 기존 비행기 아이콘 fallback |
| 26h 구분선 아래 배경 | **흰색 통일** |
| 정산 '상세 보기' 품목 내역 | **이번에도 보류** (집계 RPC + 그리디 송금액 불일치 설계 충돌이 남아 있음) |

## Phase 5 — 전역 선행 작업 (오케스트레이터가 직접 끝냄)

| 영역 | 파일 |
|---|---|
| 토큰 | `tailwind.config.js`, `src/theme/tokens.ts` — primary 네이비, sky 팔레트 재지정, ink #0E1B3D, warning-accent/bar, tab, stats |
| 새 마크 | `assets/logo/svg/splito-mark{,-tile}.svg`, `splito-landing-{icon,symbol}.svg`, `src/components/Logo.tsx`(`SplitoMark`) |
| 랜딩 애니메이션 | `src/components/AnimatedMark.tsx` (+`AnimatedMark.test.ts` — 핸드오프 @keyframes와 대조) |
| 마크 일치 테스트 | `src/components/__tests__/Logo.test.ts` |
| 마이그레이션 | `supabase/migrations/20261103161213_my_stats.sql` + `supabase/tests/140_my_stats.test.sql` (461건 전부 통과) |
| 데이터 레이어 | `src/services/api.ts`, `src/types/domain.ts`, `src/hooks/useBudget.ts`, `src/types/database.ts`(재생성) |
| 앱 아이콘 | `assets/images/*.png` 6종 재생성(새 마크), `app.config.ts`의 `ios.icon`(Expo 기본 Icon Composer 번들) 제거 |
| 문서 | `docs/UI_GUIDE.md`, `CLAUDE.md` 색 규칙, `docs/design/`(프로토타입·토큰·캡처 18장·명세 교체) |

### 흰 글자 회귀 (관계형 토큰 뒤집힘)
`primary-on`이 짙은 남색 → 흰색으로 바뀌면서, 밝은 틴트 배경 위에서 쓰던 3곳의 글자가 사라졌다.
타입 검사·린트·`tokens.test.ts` 모두 통과했으므로 **값 diff로는 못 잡는 회귀**다. 고친 곳:
`app/(app)/rooms/new.tsx:32`, `app/(app)/rooms/[roomId]/expenses/review.tsx:516`, `src/components/ScheduleChip.tsx:12`.

### 완료 판정 불변식
```bash
grep -rnE "#5EC4FF|#0874BB|#E6F6FF|#B8E5FF|#F5FBFF|#80D1FF|#131927|#1668E3|#EEF7FF|#36B6FF|#0B2B45" app src tailwind.config.js | grep -v src/theme/tokens.ts   # → 0
grep -rn "SplitoSymbol\|AnimatedSymbol" app src                                                                                                        # → 0
grep -rn "선결제 등록\|항공·숙박이 포함된" app src                                                                                                      # → 0
```

## Phase 6 — 구현 중 드러난 후속 과제 (이번 범위 밖, 보고만)

| # | 항목 | 왜 못 했나 | 필요한 것 |
|---|---|---|---|
| F1 | 공금 지갑 잔액·내역의 **현지 통화 표시**(시안 16은 `¥18,400` 큰 글자 + 원화 보조) | `pool_deposits`에 `amount_krw`만 있어 '모은 돈'의 현지 통화 원본이 스키마에 없다. 클라이언트 FX 환산은 규약 금지 | `pool_deposits`에 통화·원본 금액 컬럼 + 마이그레이션 + pgTAP |
| F2 | 정산 '상세 보기' 품목 내역 | 품목×참여자 집계 RPC 없음 + 그리디 최소 송금액과 두 사람 사이 순채무가 일반적으로 다름(설계 충돌) | 사용자 결정 후 집계 RPC + 금액 불일치 표기 설계 |
| F3 | 지출 추가 화면 타이포가 시안보다 전 요소 1~2px 큼 | 한 군데만 줄이면 어긋난다. 전역 타입 스케일 재조정은 이번 범위 밖 | `type` 스케일(28/24/20/18/17/16/14/13/12) 토큰화 후 일괄 적용 |
| F4 | 통계 탭(`app/(app)/stats.tsx`)의 `+` 대상 방 선택 규칙이 홈과 다름 | 공용 훅이 필요하고 두 화면 담당이 갈림 | 진입 방 선택 규칙 1개로 통일 |
| F5 | 지출 상세(`expenses/[expenseId].tsx`) 기준 시안 없음 | 프로토타입·캡처 18장 어디에도 없다 | 디자인 쪽에 화면 요청 |

### 1차 소스끼리 어긋난 곳 (노션이 더 나중 판본이라 노션을 따름)
- 프로토타입·`07-prepay.png`는 아직 헤더가 `선결제 등록`이다. 노션 27a의 `패키지 여행 등록`을 적용했다.
- 프로토타입·`07-prepay.png`에는 배지 영역 자체가 없다(`여행 전` 포함). 노션 27b가 2개만 지목했지만 영역 전체를 제거했다.
