# Splito 로고 컬러 차트 (최종: 반짝 지갑 A′)

| 구분 | 이름 | 값 | 용도 |
|---|---|---|---|
| 심볼 | Wallet Body (본체) | `#5EC8FF → #1668E3` | linear 135° |
| 심볼 | Wallet Flap (덮개) | `#C2EEFF → #6FCBFA` | linear 135° |
| 심볼 | Card Mint (민트 카드) | `#7CF0D8 → #12B39C` | linear 135° |
| 심볼 | Card Yellow (노랑 카드) | `#FFE68A → #FF9F2E` | linear 135° |
| 심볼 | Sparkle (별) | `#FFFFFF` | 단색 |
| 심볼 | Shadow – Light | `#1683CC · 30%` | 덮개·별 아래 그림자 |
| 심볼 | Shadow – Dark | `#000000 · 35%` | 다크 아이콘용 |
| 텍스트 | Wordmark Ink | `#0E2A47` | 라이트 배경 워드마크 |
| 텍스트 | Tagline | `#4E6378` | 라이트 배경 보조 문구 |
| 텍스트 | Tagline – Dark | `#B9C7DD` | 다크 배경 보조 문구 |
| 배경 | Dark Navy | `#0E1B3D` | 다크 아이콘·다크 배경 |
| 배경 | White | `#FFFFFF` | 라이트 아이콘·배경 |

## 폰트
- 워드마크: Nunito Black (900), letter-spacing -0.026em (SVG/PNG 워드마크는 아웃라인 처리되어 폰트 없이 사용 가능)
- 태그라인: Noto Sans KR Medium (500)

## CSS 변수
```css
:root {
  --splito-body-start: #5EC8FF;
  --splito-body-end: #1668E3;
  --splito-flap-start: #C2EEFF;
  --splito-flap-end: #6FCBFA;
  --splito-mint-start: #7CF0D8;
  --splito-mint-end: #12B39C;
  --splito-yellow-start: #FFE68A;
  --splito-yellow-end: #FF9F2E;
  --splito-ink: #0E2A47;
  --splito-sub: #4E6378;
  --splito-sub-dark: #B9C7DD;
  --splito-navy: #0E1B3D;
  --splito-brand-gradient: linear-gradient(135deg, #5EC8FF, #1668E3);
}
```

## 파일 안내
- `svg/splito-symbol.svg` 배경 없는 심볼
- `svg/splito-appicon-light.svg`, `splito-appicon-dark.svg` 앱 아이콘 원본(정사각형, iOS/Android가 모서리 마스크 적용)
- `*-rounded.svg/png` 모서리 둥근 버전(웹·문서용)
- `png/splito-appicon-light-rounded-512/192/180/64/32.png` 웹앱·파비콘 사이즈
- `svg/splito-lockup-light.svg` 라이트 락업, `splito-lockup-dark.svg` 다크 배경용 락업, `splito-lockup-light-darkicon.svg` 흰 배경+다크 아이콘
- `png/splito-lockup-tagline-*@1x/@3x.png` 태그라인 포함 락업
- `svg/splito-wordmark*.svg` 워드마크 단독