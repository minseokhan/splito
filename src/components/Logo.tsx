import { useId } from 'react';
import { Image } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop, type SvgProps } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// assets/logo/svg/splito-mark.svg · splito-mark-tile.svg 의 도형을 그대로 옮긴 것이다(AnimatedMark용 옛 마크).
// 마크(viewBox "10 4 84 92"): S + 출발 삼각형(네이비 그라데이션) + 금색 별 3개.

// 1차 소스의 좌표계: 모든 도형이 <g transform="translate(-8.5 0)"> 안에 있다.
export const MARK_SHIFT_X = -8.5;
export const MARK_MID = ['#1E4FD8', '#0E1B3D'] as const; // userSpaceOnUse 25,15 → 75,88
export const MARK_GOLD = ['#FFE27A', '#FFB020'] as const;
// S는 세로로 0.88 눌려 있다(translate(0 50) scale(1 .88) translate(0 -50)).
export const MARK_S =
  'M43,15 C29,25 29,42 45,50 L63,60 C70,64 71,74 63,85 C85,78 89,57 73,46 L56,35.5 C48,31 41,26 43,15 Z';
export const MARK_TRIANGLE = 'M37.5,59.8 L56.5,70.3 L37.5,80.8 Z';
export const MARK_STAR = 'M69.5,16 Q71.04,25.46 80.5,27 Q71.04,28.54 69.5,38 Q67.96,28.54 58.5,27 Q67.96,25.46 69.5,16 Z';
export const MARK_MINI_A = 'M83.5,9.8 Q83.95,12.55 86.7,13 Q83.95,13.45 83.5,16.2 Q83.05,13.45 80.3,13 Q83.05,12.55 83.5,9.8 Z';
export const MARK_MINI_B = 'M57,11.1 Q57.34,13.16 59.4,13.5 Q57.34,13.84 57,15.9 Q56.66,13.84 54.6,13.5 Q56.66,13.16 57,11.1 Z';
// 타일(splito-mark-tile.svg): 100×100 흰 둥근 사각 rx 23.
export const MARK_TILE_RADIUS_RATIO = 23 / 100;

// layer: 도형을 겹쳐 그릴 수 있게 한 겹만 그린다(AnimatedSplitoMark가 각 겹을 따로 움직인다).
// 생략하면 전부 그린다. mini는 반짝이 작은 별 2개로, 정지 상태에서는 그린다.
type MarkLayer = 's' | 'triangle' | 'star' | 'miniA' | 'miniB';

type MarkProps = {
  size: number;
  /** 흰 둥근 타일을 뒤에 깐다(앱 아이콘 구도). */
  tile?: boolean;
  layer?: MarkLayer;
  /** 움직이는 도형이 잘리지 않도록 viewBox를 넓힌다(랜딩 애니메이션용). */
  bleed?: boolean;
  opacity?: number;
};

// 타일 없는 마크의 viewBox는 1차 소스와 같은 "10 4 84 92". 타일을 깔면 "0 0 100 100".
export function SplitoMark({ size, tile, layer, bleed, opacity }: MarkProps) {
  const shows = (l: MarkLayer) => !layer || layer === l;
  // 같은 화면에 마크가 여러 개면 <Defs> 그라데이션 id가 충돌하므로 고유 접미사를 붙인다.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const box = bleed ? '-12 -10 124 124' : tile ? '0 0 100 100' : '10 4 84 92';
  const ratio = bleed ? 124 / 100 : 1;

  return (
    <Svg width={size * ratio} height={size * ratio} viewBox={box} opacity={opacity}>
      <Defs>
        <LinearGradient id={`mid-${uid}`} gradientUnits="userSpaceOnUse" x1="25" y1="15" x2="75" y2="88">
          <Stop offset="0" stopColor={MARK_MID[0]} />
          <Stop offset="1" stopColor={MARK_MID[1]} />
        </LinearGradient>
        <LinearGradient id={`gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={MARK_GOLD[0]} />
          <Stop offset="1" stopColor={MARK_GOLD[1]} />
        </LinearGradient>
      </Defs>
      {tile && !layer && <Rect width={100} height={100} rx={100 * MARK_TILE_RADIUS_RATIO} fill="#FFFFFF" />}
      <G transform={`translate(${MARK_SHIFT_X} 0)`}>
        {shows('s') && (
          <Path
            transform="translate(0 50) scale(1 0.88) translate(0 -50)"
            d={MARK_S}
            fill={`url(#mid-${uid})`}
          />
        )}
        {shows('triangle') && <Path d={MARK_TRIANGLE} fill={`url(#mid-${uid})`} />}
        {shows('star') && <Path d={MARK_STAR} fill={`url(#gold-${uid})`} />}
        {shows('miniA') && <Path d={MARK_MINI_A} fill={`url(#gold-${uid})`} />}
        {shows('miniB') && <Path d={MARK_MINI_B} fill={`url(#gold-${uid})`} />}
      </G>
    </Svg>
  );
}

// 최종 브랜드 파일(노션 30번, assets/brand/ 투명 PNG). 높이를 주면 폭은 원본 비율을 따른다 — 색·비율 임의 변경 금지.
const BRAND_SYMBOL = require('../../assets/brand/splito_symbol_only.png');
const BRAND_WORDMARK = require('../../assets/brand/splito_wordmark_only.png');

export function BrandSymbol({ height }: { height: number }) {
  return <Image source={BRAND_SYMBOL} style={{ height, width: (height * 1918) / 2210 }} accessibilityIgnoresInvertColors />;
}

export function BrandWordmark({ height }: { height: number }) {
  return (
    <Image
      source={BRAND_WORDMARK}
      style={{ height, width: (height * 4266) / 1862 }}
      accessibilityRole="header"
      accessibilityLabel="스플리토"
      accessibilityIgnoresInvertColors
    />
  );
}

// 카카오톡 공식 말풍선 심볼(viewBox 0 0 24 24). 공유·로그인 버튼에서 iconoir 일반 말풍선 대신 쓴다.
// Icon 래퍼가 width/height/color를 넘기므로 ComponentType<SvgProps> 계약을 맞춘다.
const KAKAO =
  'M12 18.75c-.591 0-1.1697-.0413-1.7317-.1209-.5626.3965-3.813 2.6797-4.1198 2.7225 0 0-.1258.0489-.2328-.0141s-.0876-.2282-.0876-.2282c.0322-.2198.8426-3.0183.992-3.5333-2.7452-1.36-4.5701-3.7686-4.5701-6.5135C2.25 6.8168 6.6152 3.375 12 3.375s9.75 3.4418 9.75 7.6875c0 4.2457-4.3652 7.6875-9.75 7.6875z';

export function KakaoSymbol({ width = 24, height, color = colors.kakao.text }: SvgProps) {
  return (
    <Svg width={width} height={height ?? width} viewBox="0 0 24 24">
      <Path d={KAKAO} fill={color} />
    </Svg>
  );
}
