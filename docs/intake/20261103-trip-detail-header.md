# intake-diff — 여행 상세 헤더 UI 수정 (2026-11-03)

- 산출물: 사용자 수정 목록 4건 + 스크린샷 4장 + `Splito 로고 디자인 제안 (7).zip`
- 1차 소스: `origin/dev@2933faf` 코드, zip 안 `splito-icon-flight/flight-takeoff-boxed.svg`
- 주의: 조사 시작 시점의 로컬 `dev`(13da7d2)는 낡아 있었고, 스크린샷의 화면은
  `2933faf`(#34)에서 들어온 것이다. fetch 후 `origin/dev` 워크트리에서 재대조했다.

## 판정표

| # | 항목 | 판정 | 근거 `파일:행` | 조치 |
|---|---|---|---|---|
| 1 | "여행 수정" → "여행 편집" | 미반영 | `app/(app)/rooms/[roomId]/index.tsx:322` | 라벨 문자열 교체 |
| 2a | "함께하는 사람 n명" 칩 제거 | 미반영 | `index.tsx:156-158` (`room.memberCount` 칩) | 칩 삭제 |
| 2b | 아바타 원 ≤4명 전부 노출 | 부분반영 | `src/components/AvatarStack.tsx:7,14` — 컴포넌트는 있으나 이 화면에서 렌더하지 않음 | 호출 추가 |
| 2c | 5명↑ 원 3개 + 검은 원 `+n` | 미반영 | `AvatarStack.tsx:19` — 현재 원 4개 + 회색 텍스트 `+n` | 컴포넌트 수정 |
| 3 | 아바타 탭 → 참여자 팝오버 | 코드에 없음(신규) | `grep -rn "참여자" app/(app)/rooms/[roomId]/index.tsx` → 0건 | 신규 구현 |
| 4 | 상단 비행기 아이콘 교체 | 다름 | `index.tsx:118` iconoir `Airplane` | zip의 flight-takeoff path로 교체 |

## 데이터 의존 UI

참여자 목록(이름·게스트 여부·"나")은 전부 `useRoomMembers`가 이미 주는 필드다
(`src/types/domain.ts:68` `RoomMember.kind/userId/name/leftAt`). 신규 쿼리 없음.

## 에셋 바이트 비교

zip의 `flight-takeoff-boxed.svg` = 40×40 박스(rx 11.25, fill #FFFFFF, stroke #E4E7EC 1.5)
+ 22×22 Material "flight_takeoff" path, fill `#0874BB`.
박스는 현재 코드(`h-10 w-10 rounded-chip border-[1.5px] border-line bg-white`)와 동일하고
`#0874BB` = `colors.primary.text`. **바뀌는 것은 path 하나뿐이다.**

## 범위 조정

- **추가(드리프트)**: 2c는 공용 `AvatarStack` 수정이라 다른 호출부
  `app/(app)/rooms/[roomId]/expenses/[expenseId].tsx:218`(품목 '먹은 사람' 스택)도 같이 바뀐다.
  같은 시각 규칙이므로 의도적으로 함께 적용한다.
- **재설계**: Image #4의 바깥 레이아웃(날짜 칩 + 카드 밖 아바타)은 현재 화면과 다르다.
  팝오버 카드 디자인만 가져오고, 아바타 위치는 지시 2번대로 요약 카드 우상단에 둔다.
- **승격 / 제외**: 없음.
