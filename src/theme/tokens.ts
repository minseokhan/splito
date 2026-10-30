// docs/UI_GUIDE.md 토큰. NativeWind 클래스를 못 쓰는 곳(SVG, 아이콘 color prop)용.
// tailwind.config.js와 값이 같아야 한다(tokens.test.ts).
export const colors = {
  primary: { DEFAULT: '#36B6FF', text: '#0874BB', on: '#0B2B45', press: '#1FA3F0' },
  sky: { 50: '#F5FBFF', 100: '#E6F6FF', 200: '#B8E5FF', 300: '#80D1FF' },
  ink: { DEFAULT: '#131927', 700: '#353A47', 500: '#535764', 400: '#6B7080', 300: '#A0A4AE' },
  app: '#F6F8FA',
  muted: '#F0F3F7',
  line: { DEFAULT: '#E4E7EC', off: '#D0D5DD' },
  danger: { DEFAULT: '#D92D20', soft: '#FDA29B', text: '#C4320A' },
  success: { DEFAULT: '#067647', bg: '#DCFAE6' },
  warning: { DEFAULT: '#B54708', bg: '#FEF0C7', banner: '#FFF6E5', line: '#FEDF89', deep: '#5C2D04' },
  kakao: { DEFAULT: '#FEE500', text: '#191600' },
  naver: '#03C75A',
  'on-dark-sub': '#B8C0CC',
} as const;

// 멤버 아바타 tint/fg. 합류 순서 기준 순환(민지·지훈·서연·엄마 순서가 시안 기준).
export const MEMBER_COLORS = [
  { tint: '#E6F6FF', fg: '#0874BB' },
  { tint: '#FFE7BF', fg: '#8A5300' },
  { tint: '#E6E3FF', fg: '#4B3FB5' },
  { tint: '#FFE2E8', fg: '#A8324F' },
] as const;

export const memberColor = (index: number) => MEMBER_COLORS[((index % MEMBER_COLORS.length) + MEMBER_COLORS.length) % MEMBER_COLORS.length];

export const MAX_FONT_SIZE_MULTIPLIER = 1.3;
