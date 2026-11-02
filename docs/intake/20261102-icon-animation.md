# intake-diff — 아이콘 카드 튕김 애니메이션 (2026-11-02)

- **산출물 유형:** 디자인 핸드오프 (`아이콘 애니매이션.zip` — SVG 3종 + `USAGE.md`)
- **1차 소스:** `splito-icon-animated.svg` / `-dark.svg` / `splito-symbol-animated.svg` 의 `<style>` 블록과 도형.
  `USAGE.md`는 산문 요약이며 1차 소스가 아니다.
- **반영 지점(사용자 지시):** 로그인 화면(`app/(auth)/login.tsx`)의 앱 아이콘 히어로 132px
  (최초 지시는 "런치 스플래시"였으나, 사용자가 별도 스플래시 대신 로그인 화면 로고에 넣도록 바꿨다)

## 에셋 바이트 비교

핸드오프 SVG의 **도형부는 기존 `assets/logo/svg/splito-appicon-light-rounded.svg` 와 바이트 단위로 동일**하다
(`diff` 결과: 배경 `rect` fill 1줄만 변형별로 다름). 즉 이번 핸드오프에서 **새로운 것은 `<style>`의 애니메이션뿐**이고
도형·그라데이션은 이미 `src/components/Logo.tsx`의 `SplitoSymbol`에 옮겨져 있다.

| 파일 | 도형부 | 배경 |
|---|---|---|
| `splito-icon-animated.svg` | 기존과 동일 | `#FFFFFF` 타일 |
| `splito-icon-animated-dark.svg` | 기존과 동일 | `#0E1B3D` 타일 + 그림자 `#000000/.35` |
| `splito-symbol-animated.svg` | 기존과 동일 | 없음 |

## 판정표

| # | 항목 | 판정 | 근거 `파일:행` | 조치 |
|---|---|---|---|---|
| 1 | 도형·그라데이션(카드 2장·지갑 본체·덮개·반짝임) | 반영됨 | `src/components/Logo.tsx:11-23,46-62` | 없음 — 재사용 |
| 2 | 흰 타일 배경(rx 25.7) | 반영됨 | `Logo.tsx:42` (`appIcon`) | 레이어 합성에선 타일이 카드 **뒤**에 와야 해서 RN `View`의 `borderRadius: size*0.257`로 그린다 |
| 3 | 카드 pop 키프레임 `0/14/26/33/40% = 0/-10/1.6/-1.8/0 px` | 코드에 없음(신규) | — | `AnimatedSymbol.tsx` `POP_KEYFRAMES` |
| 4 | easing `cubic-bezier(.34,1.56,.64,1)` | 코드에 없음(신규) | — | `Easing.bezier(...)` |
| 5 | 주기 2.8s 무한 반복 (활성 구간 1.12s) | 코드에 없음(신규) | — | `Animated.loop` |
| 6 | 옐로 카드 `animation-delay:.12s` | 코드에 없음(신규) | — | `YELLOW_DELAY_MS` |
| 7 | `prefers-reduced-motion` → 정지 | 코드에 없음(신규) | — | `AccessibilityInfo.isReduceMotionEnabled()` |
| 8 | 다크 타일 변형 | 낡음(불필요) | 로그인 히어로는 흰 타일 고정(`login.tsx`) | 반영 안 함 |

## 플랫폼 제약 (USAGE.md가 전제하지 않은 것)

`USAGE.md`의 두 사용법(`<img src>`, SVG 인라인 + CSS `animation-play-state`)은 **둘 다 RN에서 동작하지 않는다.**
`react-native-svg`는 `<style>` CSS·`@keyframes`를 해석하지 않고, 번들러에 SVG 로더가 없어 `<Image>`로도 못 읽는다.
그래서 애니메이션은 RN `Animated`로 재구현했고, 핸드오프 SVG와의 일치는 아래 불변식이 지킨다.

또 하나의 제약: 한 `<Svg>` 안의 `<G>`는 RN `Animated.View`로 못 움직이고, `<Svg>`는 viewBox 밖을 자른다.
카드가 `-10px` 올라가면 심볼 viewBox(`12 12 76 76`) 위로 삐져나가 잘린다. 그래서 **아이콘 viewBox(`0 0 100 100`)**
를 쓰고, 흰 타일·민트 카드·옐로 카드·지갑을 **겹친 레이어**로 그려 카드 레이어만 `Animated.View`로 움직인다
(지갑이 카드 **앞**, 타일이 카드 **뒤**에 와야 하므로 한 장으로는 불가능하다).

## 전역 불변식 (코드에 둔 것)

- `assets/logo/svg/splito-symbol-animated.svg` 를 레포에 커밋하고,
  `src/components/AnimatedSymbol.test.ts` 가 그 파일의 `@keyframes`·주기·딜레이·easing을 파싱해
  `POP_KEYFRAMES` 등과 대조한다. 핸드오프가 바뀌면 테스트가 깨진다.

## 범위 조정

- **제외:** 1·2번(도형·타일) — 이미 `Logo.tsx`에 있다. 8번(다크 타일) — 히어로 타일이 흰색 고정이라 쓸 데가 없다.
- **승격:** 없음 (데이터 의존 UI 없음, 스키마 작업 없음)
- **재설계:** `USAGE.md`의 두 사용법 → RN `Animated` 재구현 (위 플랫폼 제약)
- **추가:** 없음 (초안에서 만들었던 런치 스플래시 오버레이·네이티브 스플래시 핸드오프·퇴장 페이드는
  사용자 지시로 전부 철회했다. `app/_layout.tsx`·`expo-splash-screen` 설정은 손대지 않은 원래대로다.)
