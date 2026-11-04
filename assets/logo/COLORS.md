# Splito 로고 컬러 차트 (최종: S 마크 + 출발 삼각형 + 별, 2026-11-04)

1차 소스는 `svg/splito-mark.svg`(심볼)와 `svg/splito-mark-tile.svg`(흰 타일 포함)다.
이 문서와 값이 다르면 SVG가 기준이다.

| 구분 | 이름 | 값 | 용도 |
|---|---|---|---|
| 마크 | Mark Gradient | `#1E4FD8 → #0E1B3D` | S와 출발 삼각형. `userSpaceOnUse` 25,15 → 75,88 |
| 마크 | Sparkle Gradient | `#FFE27A → #FFB020` | 큰 별 1 + 작은 별 2. objectBoundingBox 0,0 → 1,1 |
| 마크 | Tile | `#FFFFFF` | 앱 아이콘 바탕(정사각 100×100, `rx 23`) |
| 텍스트 | Wordmark Ink | `#0E2A47` | 라이트 배경 워드마크 |
| 텍스트 | Tagline | `#4E6378` | 라이트 배경 보조 문구 |
| 텍스트 | Tagline – Dark | `#B9C7DD` | 다크 배경 보조 문구 |
| 배경 | Dark Navy | `#0E1B3D` | 다크 배경, 하단 CTA |
| 브랜드 | Primary | `#1D3C8F` | 앱 대표색(`docs/UI_GUIDE.md`) |
| 배경 | White | `#FFFFFF` | 라이트 아이콘·배경 |

## 폰트
- 워드마크: Nunito Black (900), letter-spacing -0.026em (SVG/PNG 워드마크는 아웃라인 처리되어 폰트 없이 사용 가능)
- 태그라인: Noto Sans KR Medium (500)

## 파일 안내
- `svg/splito-mark.svg` — 배경 없는 마크 (viewBox `10 4 84 92`)
- `svg/splito-mark-tile.svg` — 흰 둥근 타일 포함 (viewBox `0 0 100 100`, `rx 23`)
- `svg/splito-landing-icon.svg` / `-symbol.svg` — 랜딩 애니메이션 내장. 순서는 `LANDING-ANIMATION.md`
- `svg/splito-wordmark*.svg` — 워드마크 단독
- 앱 아이콘 PNG는 `assets/images/`에 있다(`app.config.ts`가 참조). 이 폴더의 PNG는 랜딩·스토어용이다.

## 폐기 (2026-11-03까지 쓰던 '반짝 지갑 A′')
`svg/splito-symbol.svg`, `svg/splito-appicon-*`, `svg/splito-lockup-*`, 대응 PNG는 **구 로고**다.
코드에서는 더 쓰지 않는다(`src/components/Logo.tsx`의 `SplitoMark`가 새 마크). 참고용으로만 남겨 둔다.
