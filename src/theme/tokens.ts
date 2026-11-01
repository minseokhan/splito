// docs/UI_GUIDE.md 토큰. NativeWind 클래스를 못 쓰는 곳(SVG, 아이콘 color prop)용.
// tailwind.config.js와 값이 같아야 한다(tokens.test.ts).
export const colors = {
  primary: { DEFAULT: '#36B6FF', text: '#0874BB', on: '#0B2B45', press: '#1FA3F0' },
  // 기본 sky 팔레트를 대체한다(extend 안이지만 객체 자체를 바꾼다).
  sky: { 50: '#F5FBFF', 100: '#E6F6FF', 200: '#B8E5FF', 300: '#80D1FF' },
  ink: { DEFAULT: '#131927', 700: '#353A47', 500: '#535764', 400: '#6B7080', 300: '#A0A4AE' },
  app: '#F6F8FA',
  muted: '#F0F3F7',
  line: { DEFAULT: '#E4E7EC', off: '#D0D5DD' },
  danger: { DEFAULT: '#D92D20', soft: '#FDA29B', text: '#C4320A' },
  success: { DEFAULT: '#0B7D6C', bg: '#E3F8F2', badge: '#DDF8F1', icon: '#7CF0D8' },
  warning: { DEFAULT: '#A35A00', bg: '#FFF4D6', badge: '#FFF1CC', banner: '#FFF8E1', line: '#FFD873', deep: '#5A3A00' },
  // 외화 금액은 현지 통화를 크게 local, 원화를 작게 ink-300으로 쓴다.
  local: '#1668E3',
  tagline: '#4E6378',
  alert: '#F04452',
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
