# intake-diff — UI 수정 7건 (2026-11-02)

- **산출물 유형:** 기능 변경 목록 + 실기 스크린샷 11장 (채팅)
- **1차 소스:** 현재 코드(`origin/dev` = 5652ffe), `supabase/migrations/20261101172427_balances_visibility.sql`(방 status 파생), 스크린샷(현재 동작 증거)
- **주의:** 스크린샷은 *시안*이 아니라 *현재 상태*다. 따라서 "값 diff"가 아니라 "현재 동작 → 목표 동작" 대조로 돌렸다.

## 판정표

| # | 항목 | 판정 | 근거 `파일:행` | 조치 |
|---|---|---|---|---|
| 1 | 피드의 활동 로그(`payout_reveal` 등) 제거, 지출만 표시 | 미반영 | `app/(app)/rooms/[roomId]/index.tsx:51,246-253` (`mergeActivity` + `ActivityRow`) | 피드를 `groupFeed(지출)`만으로. **`payout_request` 탭 → 계좌 등록 진입이 유일 경로라 동반 소실** → 사용자 확인 필요 |
| 2a | 멤버 화면 '게스트 추가' 버튼 제거 | 미반영 | `app/(app)/rooms/[roomId]/members.tsx:72` | 삭제 |
| 2b | '초대하기'를 파란 버튼 + 아이콘 | 미반영 | `members.tsx:73-77` (`variant="muted"`, 아이콘 없음) | `variant` 제거(기본=primary) + `icon={UserPlus}` |
| 2c | 초대 시트의 '앱 없는 동행 추가' → 게스트 추가 시트 즉시 | 부분반영 | `InviteSheet.tsx:35,97-100` → `members?addGuest=1` **푸시**. 멤버 화면에서 누르면 멤버 화면이 한 장 더 쌓인 위에 시트가 뜬다 | 멤버 화면에서는 `onAddGuest`로 인라인 오픈. 다른 화면(여행 상세·정산)은 기존 푸시 유지 |
| 3a | "진행 중인 여행이" → "정산 중인 여행이" | 미반영 | `app/(app)/home.tsx:113` | 문구 교체 |
| 3b | 카드 목록을 '정산이 필요한 여행'으로 | 미반영 | `home.tsx:67` (`status !== 'settled'` 전부) | **'정산 필요' 정의가 산출물에 없음** → 사용자 확인 필요 |
| 4 | 여행 상세 '내 정산' 박스 제거 | 미반영 | `app/(app)/rooms/[roomId]/index.tsx:163-170` | 삭제. `Money` import·`room.myNet` 고아화 → 함께 정리 |
| 5 | 3칸 칩 가운데 정렬 + '말로/직접 입력' 1줄 | 미반영 | `expenses/new.tsx:345-348`(`\n` 포함 label), `:388`(`items-start`) | `items-center` + `text-center`, 두 label의 `\n` 제거 |
| 6 | 직접 입력 → 뒤로가기가 방법 선택으로 | 미반영(버그) | `expenses/new.tsx:99` `router.replace` → 방법 선택 화면이 스택에서 사라짐 | manual 경로만 `push` + `setPicked(undefined)`, 저장 후 복귀는 `review.tsx`에서 방 화면으로 `dismissTo` |
| 7 | '말로 입력 예시' 블록 제거 | 미반영 | `expenses/new.tsx:394-400` | 삭제 |

## 데이터 의존 UI 확인

- 3b '정산이 필요한 여행': `my_rooms()` RPC가 이미 `status`(`settled|settling|shared|solo`)와 `my_net`을 내려준다 → **스키마 작업 불필요**, 클라이언트 필터만. (`balances_visibility.sql:92-104`)
- 1번 활동 로그: `api.roomEvents`(`src/services/api.ts:328`) / `room_events` 테이블 존재. 제거는 표시 계층 변경이지 스키마 변경이 아니다.

## 범위 조정

- **제외:** 없음 (7건 전부 미반영)
- **승격:** 1번의 `payout_request` 알림 — 제거하면 "남이 내 계좌 등록을 요청했다"를 알 방법이 사라진다(설정 › 받을 계좌는 수동 진입만). 별건 판단 필요
- **재설계:** 6번은 "뒤로가기 수정"이 아니라 `replace`/`push` 스택 설계 변경이다. `review.tsx`의 저장 후 복귀도 같이 바꿔야 한다
- **추가(드리프트):** 2c는 "안 된다"가 아니라 "멤버 화면이 중복으로 쌓인다"가 실제 증상이었다

---

## 추가 요청 8 (대화 중 전달)

| # | 항목 | 판정 | 근거 `파일:행` | 조치 |
|---|---|---|---|---|
| 8 | 기간(시작일·종료일)을 달력 선택으로 | 미반영 | `app/(app)/rooms/new.tsx:147-158` — `TextInput` + `keyboardType="numbers-and-punctuation"` + `YYYY-MM-DD` placeholder | 기존 `src/components/DateSheet.tsx`(결제일 달력) 재사용. 새 달력 만들지 않음 |

`DateSheet`는 제목이 `'결제일'`로, 상한이 `addDays(today,1)`로 **하드코딩**돼 있었다(여행 기간은 미래여야 한다).
→ `title`·`min`·`max`를 옵셔널로 열고 **기본값 없음(제한 없음)** 으로 바꿨다. 결제일의 "모레 이후 금지" 규칙은
그 규칙을 소유한 `review.tsx` 호출부로 옮겼다(`max={addDays(kstToday(new Date()), 1)}`).
호출부 전수: `review.tsx` 1곳뿐 — 동작 동일함을 확인.

## 구현 후 범위 변경 (보고)

- **3b 연쇄:** 상단 카드를 `myNet !== 0` 으로 좁히자 "지출이 아직 없는 새 방"이 어느 목록에도
  속하지 않게 됐다. 하단 접기를 `settled`에서 **여집합**(`!needsSettle.includes(r)`)으로 바꾸고
  라벨을 "정산 완료한 여행 N개" → **"정산할 게 없는 여행 N개"** 로 수정했다. 요청에 없던 변경이지만
  빼면 방에 들어갈 길이 사라진다.
- **6 연쇄:** `review.tsx`의 저장·합치기 후 복귀를 `router.back()` → `router.dismissTo(방)`으로 바꿨다
  (작성 모드만. 수정 모드는 `back()` 유지 — 지출 상세로 돌아가야 한다).
- **8 연쇄:** 달력은 빈 값을 만들 수 없어 '기간'(선택 항목)을 비울 방법이 사라진다 → 라벨 줄에 '지우기' 추가.

---

## 2차 요청 4건 (A~D)

| # | 항목 | 판정 | 근거 `파일:행` | 조치 |
|---|---|---|---|---|
| A | 칩 3개 아이콘 높이 통일 + 1줄 라벨을 2줄 사이에 | 미반영 | `expenses/new.tsx` MethodPicker — `items-center justify-center`라 줄 수에 따라 아이콘 y가 달라짐 | 칩을 위에서부터 쌓고(`items-center`), 라벨 칸을 `h-[46px] justify-center`로 고정 |
| B | 초대시트 '앱 없는 동행 추가' → 게스트 시트 | **회귀(직전 세션에서 내가 넣음)** | `members.tsx` — 초대 시트와 게스트 시트가 각각 RN `Modal`. 닫히는 모달 위에 띄운 모달은 iOS가 무시한다 | 시트 **하나**를 두고 내용만 교체. `GuestSheet` → `GuestForm`(본문만), `InviteSheet`의 옵셔널 prop은 원복 |
| C | review에 '정산할 곳' 선택 + 홈 업로드 기본값 | 미반영 | `home.tsx` `target`, `review.tsx` 결제일 섹션 | 결제일 위에 드롭다운(작성 모드 & 선택지 2개 이상). 홈 기본값 = 최근 지출 올린 방 |
| D-1 | 품목 이름·가격 바로 수정 | **이미 반영됨** | `ItemBox.tsx:56-67,73-89` — 편집 모드에서 이미 `TextInput`. `review.tsx:402-406`이 `onChangeName`·`onChangeAmount` 전달 | 기능 추가 아님. **어포던스 부재**가 원인 → 점선 밑줄 + 포커스 색만 추가 |
| D-2 | 품목 삭제 | 미반영 | `expenseForm.ts`에 `removeItem` 없음(`addItem`·`splitItem`만) | `removeItem` TDD로 추가 + `ItemBox`에 탭→X 삭제 |

### C의 숨은 비용 (요청에 안 적힌 것)

방을 바꾸면 **지출에 붙은 거의 모든 id가 같이 바뀌어야** 한다:
- `draft.roomId`
- `assigneeMemberIds`·`payerMemberId` — 참여자 id는 **방마다 다르다** → 비우고 새 방에서 다시 잡는다
- 기기 사진 `drafts/<roomId>/` → `keepPhoto(next, uri)`로 복사
- 스토리지 사진 `<roomId>/<expenseId>/*.jpg` → `copyReceipt`로 복사 (RLS가 방 단위라 경로를 안 옮기면 새 방에서 못 읽는다)
- AsyncStorage 키 `draft:<roomId>` → 새 키로 저장 후 옛 키 삭제 (**복사 성공 후에** 삭제 — `clearDraft`가 사진 폴더까지 지운다)
- 라우트 `/rooms/[roomId]/expenses/review` → `router.replace`로 교체

결제자는 `payerMemberId: null`로 비우고, review가 새 방의 내 참여자 id로 채우게 했다.

### D-1 관련 범위 보고

"수정 기능 구현"은 **할 일이 없었다** — 이미 동작하고 있었다. 대신 안 보이던 게 문제라
표시만 바꿨다. 기존 편집 로직은 한 줄도 건드리지 않았다.

---

## 3차: 사진 입력 화면 (영수증/캡처 토글 제거 + 인앱 카메라)

| 항목 | 판정 | 근거 | 조치 |
|---|---|---|---|
| '영수증/결제앱 캡처' 토글 제거 | 미반영 | `expenses/new.tsx` `photoKind` state → `source`(`receipt`/`card_image`)와 `expense_photos.kind` 결정 | 토글 삭제, AI 판정으로 대체 |
| 종류 자동 인식 | **코드에 없음(신규·서버)** | `_shared/parseSchema.ts`에 해당 필드 없음. `source`는 클라이언트가 사용자 선택으로 정하고 있었다 | `photo_kind: 'receipt'\|'capture'\|null` 추가 + 프롬프트 1줄 + Deno 테스트 2개. splito-dev에 **v4 배포 완료** |
| 인앱 카메라 프리뷰 | **코드에 없음(신규·네이티브)** | `expo-image-picker`만 있음 — OS 카메라를 띄울 뿐 화면 안 프리뷰 불가 | `expo-camera@~57.0.6` 추가, `CameraPane` + `takePictureAsync`. **dev build 재빌드 필요** |

### 확인한 전제

- `source`가 실제로 쓰이는 곳은 **지출 카드 라벨 한 줄**뿐이다(`영수증` vs `결제 캡처`). 아이콘은 둘 다 카메라(`home.tsx:22`, `ExpenseCard.tsx:13-14`).
- DB `expenses.source` check 제약에 `card_image`가 이미 있어 **마이그레이션 불필요**(`20261029000000_schema.sql:81`).
- 카메라 권한 문구는 `app.config.ts`의 expo-image-picker 플러그인에 이미 있음 → 추가 작업 없음.
- `photo_kind`는 zod `.optional()` → **구 버전 함수가 응답해도 클라이언트가 깨지지 않는다**(기본 `receipt`).

### 남는 제약

iOS 시뮬레이터에는 카메라가 없다 → 프리뷰 자체의 QA는 실기기에서만 가능. 앨범 경로와 자동 인식은 시뮬레이터에서 확인 가능.
