# intake-diff · 여행 상세 3a 확정 시안

- 받은 것: `Splito 로고 디자인 제안 (5).zip` → `splito-trip-detail-3a/` (README.md · splito-tokens.json · trip-detail-3a.html)
- 유형: **디자인 핸드오프**
- 1차 소스: `trip-detail-3a.html`(인라인 수치) + `splito-tokens.json`. README는 산문 요약이므로 어긋나면 HTML이 이긴다.
- 대상 코드: `app/(app)/rooms/[roomId]/index.tsx`, `src/components/ExpenseCard.tsx`, `src/lib/tripDays.ts`
- 사용자 추가 지시: **카테고리 칩의 아이콘은 유지**(시안에는 아이콘 없음 → 시안보다 사용자 지시가 우선)

## 값 diff (토큰)

| 값 | 핸드오프 | 코드 | 판정 |
|---|---|---|---|
| `primary` | `#36B6FF` | `#5EC4FF` | **다름** — HTML에서는 `linear-gradient(135deg,#36B6FF,#5EC4FF)`의 시작점으로만 쓴다. 전역 토큰을 바꾸면 앱 전체가 다시 칠해지므로 **이 카드 안에서만** 그라데이션 시작색으로 쓰고 전역 `primary`는 유지 |
| `#EEF0F3`(탭 하단 헤어라인) | HTML에만 | 없음 | **예외 기록** — `muted`(`#F0F3F7`)와 육안 구분 불가라 기존 토큰 재사용 |
| `#EEF2F6` | HTML에만 | 없음 | 목업 프레임 바깥 배경. 화면 요소 아님 → 제외 |
| 멤버 tint/fg 4색 | tokens.json | `src/theme/tokens.ts:MEMBER_COLORS` | 반영됨 (tailwind가 아니라 theme 파일에 있어 diff에 잡힌 오탐) |
| 그 외 전 색상 | — | — | 반영됨 |

## 존재 태깅 · 항목 판정

| # | 항목 | 판정 | 근거 | 조치 |
|---|---|---|---|---|
| 1 | 상단 바(60): 뒤로 + 아이콘박스 40/r12 + 제목 17/600 + 날짜 13 + 더보기 | **코드에 없음(신규)** | `index.tsx:120` 히어로 안 `NavBar` 가운데 제목만 | 화면에 직접 그린다. 공용 `NavBar`에 슬롯 prop을 추가하지 않는다(호출부 20곳 영향) |
| 2 | 비행기 아이콘(`flight_takeoff`) | **데이터 없음** | `MyRoom`에 아이콘·이모지 필드 없음(`src/services/api.ts:myRooms`) | 방별 아이콘은 기능작업. 시안도 고정 1종이므로 iconoir `Airplane` 고정 장식으로 구현 |
| 3 | 요약 카드 그라데이션 r24 + 그림자 | **다름** | 현재는 단색 `bg-primary` 히어로(`index.tsx:120`) | `react-native-svg` `LinearGradient`로 구현(`expo-linear-gradient` 추가하지 않음 — 이미 `PrimaryButton.tsx:86`에서 쓰는 방식) |
| 4 | "함께하는 사람 N명" 칩 | **반영됨(데이터)** / 표시 다름 | `room.memberCount`(`api.ts:77`) | `AvatarStack` → 텍스트 칩으로 교체 |
| 5 | 액션 바 3등분(정산/공금/초대) 흰 92% r16 h44 | **부분반영** | `index.tsx:Action` — 세로형 3칸 | 가로 1줄 + 구분선으로 교체. 동작(`together` 분기)은 그대로 |
| 6 | 날짜 탭 밑줄형 | **다름** | `index.tsx:DayPicker` 카드형 | 교체. 7칸 이상은 기존 가로 스크롤 유지 |
| 6a | 지출 있는 날 점(dot) | **코드에만 있음** | `index.tsx:77 hasExpenseByDay` | 시안에 자리가 없음 → 제거. `hasExpenseByDay`+테스트도 함께 제거(이 변경으로 고아) |
| 6b | "여행 전" 칸 | **부분반영** | `tripDays.ts:36` `{top:'여행',bottom:'전'}` 2줄 | 1줄 `{top:'',bottom:'여행 전'}`로 바꾸고 테스트 갱신 |
| 7 | 품목 칩 32h / 선택 `#E6F6FF`·`#0874BB` / 미선택 `#F6F8FA`·`#535764` | **다름** | `index.tsx:200` 선택 시 `bg-ink`+흰 글자 | 시안 색으로 교체. **아이콘은 사용자 지시로 유지** |
| 7a | 시안 칩 목록에 '기타' 없음 | **낡음 아님, 시안 축약** | `src/lib/category.ts` 6종이 DB check 제약과 1:1 | 6종 전부 유지 |
| 8 | 지출 행: 타일 42/r14, 우측 **현지통화 크게 `#1668E3` + 원화 작게** | **다름(동작 후퇴 아님, 반전)** | `ExpenseCard.tsx:52` 현재 원화가 크고 외화가 작음 | 반전. 호출부가 `index.tsx` 하나뿐이라 공용 영향 없음 |
| 8a | 원화 결제 행 `₩396,000` + "원화결제" | **코드에 없음(신규)** | 현재 KRW는 보조줄 없음 | `formatForeign(amount,'KRW')`가 이미 `₩` 심볼을 낸다(`currency.ts:3`) |
| 8b | 환율 대기 / 나만보기 / 검토 배지 | **코드에만 있음** | `ExpenseCard.tsx` | 기능이므로 유지 |
| 9 | 목록 평면 + 1px `#F0F3F7` 구분선, 배경 흰색 | **다름** | 현재 `bg-app` + 흰 카드 | 교체 |
| 10 | 그룹 헤더 13/600 `#535764` | 반영됨 | `index.tsx:233` | 유지. 우측 합계는 시안에 없으나 정보 손실이라 유지(아래 '추가' 참조) |
| 11 | 하단 CTA 56/r16 `#131927` | **반영됨** | `PrimaryButton variant="dark"` | 변경 없음 |
| 12 | 빈 상태 문구 | 반영됨 | `index.tsx:ListEmptyComponent` | 유지 |

## 데이터 의존 UI

| UI | 필드 | 결과 |
|---|---|---|
| 날짜 탭 필터 | `rooms.start_date`/`end_date`, 피드 섹션 키 | 있음 |
| 품목 칩 필터 | `expenses.category` | 있음 (`src/lib/category.ts`, DB check 제약) |
| "함께하는 사람 N명" | `my_rooms.member_count` | 있음 |
| 총 지출 | `my_rooms.total_krw` | 있음 |
| 행 좌측 아이콘 | `expenses.source` | 있음 (`ExpenseCard.SOURCE_ICON`) |
| 방 아이콘(비행기) | — | **없음** → 고정 장식으로 처리 |

프로토타입에 `Math.random`·하드코딩 매핑·접두사 매칭 없음(정적 HTML, 스크립트 없음).

## 에셋 바이트 비교

핸드오프에 에셋 파일 없음(README·JSON·HTML 3개뿐). 로고·아이콘 재전달 아님 → 해당 없음.

## 범위 조정 (네 방향)

- **제외**: 하단 CTA(이미 일치), 빈 상태 문구, `together` 분기 동작
- **승격**: 없음 — 방별 아이콘만 데이터가 없는데 시안 자체가 고정 비행기 1종이라 기능작업으로 올리지 않는다
- **재설계**: 없음(선행 머지로 낡은 지시 없음)
- **추가(시안에 없지만 코드에 있어 유지하는 것)**: 오프라인 배너 · 작성 중 지출 배너 · 환율 대기 배너 · 그룹 합계 · 지출 배지 3종 · 계좌 등록 요청 행(`ActivityRow`) · 1인 방 안내 문구. 전부 기능이므로 시안에 없다는 이유로 지우지 않는다
- **삭제**: 날짜 칸의 지출 점(dot) — 밑줄 탭에 자리가 없어 시안이 버린 요소
