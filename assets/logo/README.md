# Splito 로고 파일

## svg/

| 파일 | 용도 |
|---|---|
| splito-symbol.svg | 기본 심볼. 민트·옐로 카드 2장 + 하늘색 지갑 본체 + 덮개 + 반짝임 (viewBox `12 12 76 76`) |
| splito-wordmark.svg | "splito" 워드마크. 아웃라인 path이므로 폰트가 필요 없다 (`#0E2A47`, viewBox `0 -90.5 310.7 113.7`) |
| splito-wordmark-white.svg | 같은 워드마크 path에 흰 fill. 어두운 배경용 |
| splito-appicon-light.svg | 앱 아이콘 원본(밝은 배경, 정사각) |
| splito-appicon-light-rounded.svg | 밝은 배경 + 라운드 마스크 |
| splito-appicon-dark.svg | 앱 아이콘 대안(어두운 배경, 정사각) |
| splito-appicon-dark-rounded.svg | 어두운 배경 + 라운드 마스크 |
| splito-lockup-light.svg | 심볼 + 워드마크 가로형(밝은 배경) |
| splito-lockup-dark.svg | 가로형(어두운 배경) |
| splito-lockup-light-darkicon.svg | 가로형(밝은 배경 + 어두운 아이콘) |

## png/

내보내기 결과물. 앱 아이콘은 `splito-appicon-light-1024.png`, 라운드 아이콘은 `splito-appicon-light-rounded-{32,64,180,192,512,1024}.png`, 스플래시·안드로이드 전경은 `splito-symbol-1024.png`를 쓴다. 락업·태그라인·워드마크 PNG는 랜딩·스토어 스크린샷용이다.

`assets/images/`의 아이콘(`icon.png`, `favicon.png`, `splash-icon.png`, `android-icon-foreground.png`, `android-icon-monochrome.png`)은 위 PNG를 복사한 것이다.

## colors.json / COLORS.md

로고 그라데이션·배경 색상값. 앱 UI 토큰은 `docs/UI_GUIDE.md`가 기준이다.

## 코드에서 쓰는 방법

앱 화면은 이 SVG 파일을 직접 불러오지 않는다. `src/components/Logo.tsx`가
`splito-symbol.svg`와 `splito-wordmark.svg`의 도형을 react-native-svg로 그대로
재현하며, `SplitoSymbol`(`color`/`white`/`navy`)과 `Wordmark`(`ink`/`white`)를 내보낸다.
SVG 도형이 바뀌면 이 파일들과 `Logo.tsx`를 함께 갱신해야 한다.
