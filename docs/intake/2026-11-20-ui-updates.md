# 2026-11-20 노션 'UI 업데이트' 반영 (4·5·9·11~20번)

1차 소스(우선순위 순)
1. 노션 UI 업데이트 DB 각 행의 TO-BE (행 URL은 아래 표) — 최신 결정
2. 클로드 디자인 프로젝트 `Splito UXUI`(projectId `27203344-ecdb-4cc7-b20f-6139c216ef8d`)의 `Splito App.dc.html` 중 **1a 프로토타입** 화면만
   - 브라우저: https://claude.ai/design/p/27203344-ecdb-4cc7-b20f-6139c216ef8d?file=Splito+App.dc.html (왼쪽 목록에서 화면 선택, 버튼을 눌러 이동 흐름 확인 가능)
   - 수치: DesignSync `get_file`(path `Splito App.dc.html`), 핸드오프 `handoff/2026-11-18-screens/CHANGES.md`, `handoff/2026-11-18-schedule-card/schedule-card-spec.md`, `handoff/2026-11-20-color/CHANGES.md`
3. 노션 '파일과 미디어' 사진은 보지 않는다(사용자 지시).

제외: 2번(내보내기), 3번(말로 입력, 진행 중), 21번(홈 여행 카드).

## 선행 반영 (오케스트레이터, 수정 금지)
- 20번 색 토큰: `tailwind.config.js`·`src/theme/tokens.ts` 값 교체(키 이름 유지). primary=#1A8FE6(주요 버튼), primary-text=#1272BF(링크·강조·외화), local=#1272BF, ink=#17203A, ink-500/400=#5B6478, ink-300=#8A92A3, app=#F8F9FB(회색 박스·입력칸), line=#E4E7ED, card-line·muted=#F1F3F6, danger=#D92148(+danger-bg #FDE8EF), success=#10A587, warning=#E89400 on #FFF5DC, info=#12A877 on #E6F7F0, sky-50~700, mint-50/100/600/700, ice, 멤버 0번(나) #D8EFFF/#1272BF.
- 카테고리 색: `colors.cat.<code>.{bg,icon,chart}` (Tailwind `bg-cat-food-bg` 등). 코드 키는 `src/lib/category.ts`(food/shopping/sightseeing/lodging/transport/other).
- 14번 둥글기 토큰: `rounded-badge 8 / toggle 10 / chip·input·button 12 / box·card-lg 16 / card·sheet 20 / hero 28`. `BottomSheet`는 `rounded-t-sheet`(20).
- 공용 컴포넌트 `src/components/CategoryCircle.tsx` (28px/16px, 40px/20px, `onGray`로 회색 박스 안 '기타' 흰 원).

## 전역 불변식 (완료 조건)
```
OLD='1D3C8F|0E1B3D|0E2A47|535764|6B7080|353A47|4A4D55|A0A4AE|8A93A6|D0D5DD|C9CED6|B8C0CC|E4E7EC|EEF0F3|DDE2EA|ECEEF2|EEF1F5|F0F3F7|E9EDF2|F6F8FA|F5F7FA|F9FAFB|F3F6FB|E3F8F2|DDF8F1|D92D20|A35A00|FFF1CC|C98A00|FEF3F2|E8EEF8|DCE4F3|EEF2F9|C2CFE8|B4C2E3|1668E3|16306F|29, ?60, ?143|14, ?27, ?61'
grep -rniE "$OLD" app src | grep -v "\.test\." → 0건 (예외: 브랜드 로고 SVG 색은 사유를 적고 유지 가능)
grep -rn "rounded-2xl\|rounded-xl\|rounded-lg\|rounded-\[" app src → 토큰 밖 값 0건
```

## 파일 소유권
| 작업자 | 번호 | 소유 파일 (이것만 수정) |
|---|---|---|
| A 확인하고 나누기 | 18, 5, 4 (+11·13·17 해당 화면분) | `app/(app)/rooms/[roomId]/expenses/review.tsx`, `review.test.tsx`, `src/components/{ItemBox,DateSheet,Badge,ReceiptThumb,AvatarStack,ScheduleChip}.tsx`(+각 테스트), `src/lib/{expenseForm,calendar,duplicate,currency}.ts`(+테스트) |
| B 여행 상세·일정 | 19, 16, 9, 15, 13, 17(일정표·지출 내역), 11(여행 상세) | `app/(app)/rooms/[roomId]/index.tsx`, `src/components/{ScheduleSection,ScheduleSheet,ExpenseCard,MenuPopover,ActivityRow,categoryIcon}.tsx`, `src/lib/{schedule,tripDays,feed,activity}.ts`(+테스트), `src/hooks/useBooking.ts`, `src/hooks/useFeed.ts`, `src/services/api.ts`, `src/types/*`, `supabase/migrations/2026112*`, `supabase/tests/21*_*.sql` |
| C 지출 상세 | 12, 11(지출 상세) | `app/(app)/rooms/[roomId]/expenses/[expenseId].tsx`, `src/hooks/useExpense.ts` |
| D 나머지 화면 | 14(남은 화면), 20(남은 하드코딩), 13(내 통계 차트), 17(홈 최근 기록) | 위 표에 없는 `app/**`, `src/components/**` 전부 (단 `RoomCard.tsx`·`home.tsx` 홈 여행 카드 구조는 21번이라 손대지 않음, `voice.tsx`는 3번 진행 중이라 색·둥글기 값만) |

공용 파일(`tailwind.config.js`, `src/theme/tokens.ts`, `BottomSheet.tsx`, `CategoryCircle.tsx`, `docs/`, `CLAUDE.md`)은 오케스트레이터 소유.

## 노션 행
| 번호 | URL |
|---|---|
| 4 | https://app.notion.com/413b43177078811ea7d1d9b84deffc4e |
| 5 | https://app.notion.com/413b43177078817c9295ebb64310b150 |
| 9 | https://app.notion.com/41cb4317707881559b73d7b0954b4861 |
| 11 | https://app.notion.com/41cb4317707881959f8fdc601eca0868 |
| 12 | https://app.notion.com/41cb4317707881ad89daeb10016061ce |
| 13 | https://app.notion.com/41cb4317707881659d2cd2767bf48a5b |
| 14 | https://app.notion.com/41cb4317707881139cc1d2720f150e1c |
| 15 | https://app.notion.com/41cb43177078817abaf4f57e816f24cc |
| 16 | https://app.notion.com/41cb431770788119a8afcce420a0c899 |
| 17 | https://app.notion.com/41cb4317707881ca92c4e1844f8125f3 |
| 18 | https://app.notion.com/41cb4317707881369658f0b548023b0d |
| 19 | https://app.notion.com/41cb431770788108950bcb2cfad6d77b |
| 20 | https://app.notion.com/41eb431770788188921ee37b37f54fa0 |

## 판정표
(작업자별 보고를 아래에 붙인다)

### 결과 요약 (2026-11-20)
| 번호 | 판정(작업 전) | 조치 | 근거·비고 |
|---|---|---|---|
| 4 | 반영됨(토스트 수량만 누락) | 토스트 `×N` 추가 | `src/lib/expenseForm.ts` mergeSplit |
| 5 | 미반영 → 18④로 대체 | 아바타 원 + [전원] | `src/components/review/ItemRow.tsx` |
| 18 | 부분반영 | 토글·티켓·줄 목록·일정 카드·결제일 달력 | 보류: 지출 2건 이상(draft 1건 모델) |
| 19 | 부분반영 | 요약 카드·고정 날짜 탭·⇄ 전환·일정 카드 재작성, 자유여행 일정표 | `index.tsx`, `ScheduleSection.tsx` |
| 16 | 코드에 없음 | `src/components/trip/ScheduleEmpty.tsx` | 마스코트 대신 로고 마크 |
| 9 | 데이터 없음 → 마이그레이션 | `20261120090000_schedule_order.sql` (position, start_time null) | dev 반영(db push), pgTAP 210 |
| 12 | 부분반영 | 상세 헤더 카드·삭제 규칙·확인 창 | 서버 `delete_expense` 권한 검사(FORBIDDEN·SPOT_SENT) 추가 |
| 11·13·15·17 | 부분반영 | 금액 규칙·카테고리 원·팝오버 200 | `CategoryCircle` |
| 14·20 | 토큰 교체 | 둥글기·색 토큰, 하드코딩 제거 | 예외: 로고 브랜드 색, 로그인 랜딩 둥글기 |
| 20 결정 | — | 경고 글자 `warning-text` #B87400 | 대비 2.2:1 문제 |
