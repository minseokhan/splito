# 지출 내역 내보내기(Excel·PDF) 명세 대조 — 2026-11-11

1차 소스: 사용자가 준 명세(2026.11.10 결정 사항 포함)와 샘플 파일 `Splito_Osaka-Kyoto_20261020-1023_sample.xlsx`·`.pdf`(4쪽).
대조 기준 코드: `feat-design-polish`(dev 39e08e2 기반).

## 결정 (사용자, 2026-11-11)
- 진입 위치: **내 통계** 화면 하단 카드(명세의 '여행 방 설정 › 지출 내역 내보내기' 대신).
- 생성 위치: **서버(Edge Function `export-expenses`)**. 앱에 PDF·공유 네이티브 모듈이 없어 새 dev 빌드를 피했다.
- Excel 디자인: 샘플은 서식이 없다. 제목 행·남색 머리글·줄무늬·합계 행 강조를 새로 얹었다(사용자 허용).

## 판정표

| # | 항목 | 판정 | 근거 | 조치 |
|---|---|---|---|---|
| 1 | 사람별 몫(1/N·품목별·자투리=결제자) | 코드에 없음(신규) | 배분은 `room_balances`(20261102165251) CTE 안에만 있다 | `export_expense_shares` RPC 신설, 같은 CTE. pgTAP 190 |
| 2 | 범위: 공동 + 내 나만 보기 | 반영됨(RLS) | `expenses_select` 정책 20261101141059:45 | RPC도 같은 조건 |
| 3 | 삭제된 지출 제외 | 반영됨 | `deleted_at is null` | — |
| 4 | 카테고리 6종 | 반영됨 | `expenses.category` 20261101172517:6 | 라벨 매핑 |
| 5 | 일정 열 | 반영됨 | `expenses.schedule_id` 20261103072519:53, `schedule_items.title` | — |
| 6 | 대표 일정(날짜별) | 데이터 없음 | 일차별 대표 필드 없음 | 그 일차의 가장 이른 일정 제목으로 대체 |
| 7 | 결제 시각 | 반영됨(nullable) | `paid_local_time` | 시간 없는 지출은 그날 맨 뒤 |
| 8 | 이 자리 정산 '완료' | 반영됨 | `spot_settles.sent_at`·`spot_expenses` (RLS로 직접 조회 불가) | `room_spot_settles` RPC로 읽는다 |
| 9 | 입력 방식 '자동 등록' | 반영됨 | `expenses.flags` 'auto_prepay' (prepay.tsx:73) | source보다 우선 |
| 10 | 나누는 방식 '직접 입력' | 데이터 없음 | 금액 직접 지정 배분이 앱에 없다 | 1/N·품목별·나만 보기만 낸다 |
| 11 | 환율(지출별) | 반영됨 | `expenses.fx_rate`(1단위당 원) | 기본 통화 환율이 한 가지일 때만 머리말에 '1엔 = 9.10원' |
| 12 | 나간 사람 `(나감)` | 반영됨 | `room_members.left_at` | — |
| 13 | 차액 합 0 검증 | 신규 | — | 공금 결제는 '공금' 한 줄로 받아야 0이 된다(명세에 없음 → **추가**) |
| 14 | 환율 대기 지출 | 명세에 없음 → **추가** | `fx_source='pending'`이면 `krw_amount` null | 줄은 남기고 '환율 대기', 합계·몫에서 제외 |
| 15 | 게스트는 내보낼 수 없음 | 반영됨(구조적) | 게스트는 계정이 없어 앱에 들어올 수 없다 | 별도 분기 없음 |
| 16 | 지출 0건 비활성 | 신규 | — | 내 통계 카드 회색 + '아직 올린 지출이 없어요', 서버도 NO_EXPENSE |
| 17 | PDF 글자 선택 가능 + Pretendard | 신규 | — | pdf-lib + Pretendard(TTF 변환, KS X 1001 2,350자 서브셋). OTF(CFF)는 fontkit이 못 읽고, `subset: true`는 글리프를 잃는다 |
| 18 | 로고 SVG 그대로 | 부분반영 | pdf-lib는 SVG를 못 그린다 | 같은 디자인의 `splito-lockup-light.png`(1963×560)를 넣었다 |
| 19 | 공유 시트 | 부분반영 | `expo-sharing` 없음 | RN `Share.share({ url })` — iOS는 파일 공유, **Android는 파일 첨부가 안 된다**(expo-sharing + 새 빌드 필요) |

## 범위 조정
- 제외: 없음.
- 승격(기능 작업): #1(RPC), #17(서버 PDF) — 사용자 승인됨(서버 생성 선택).
- 재설계: 진입 위치(내 통계).
- 추가: #13 공금 줄, #14 환율 대기 처리.
- 알려진 한계: KS X 1001 밖 한글(예: 똠·햏)은 PDF에서 '?'로 나온다. Android 파일 공유.
