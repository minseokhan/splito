// docs/UI_GUIDE.md 토큰. NativeWind 클래스를 못 쓰는 곳(SVG, 아이콘 color prop)용.
// tailwind.config.js와 값이 같아야 한다(tokens.test.ts).
export const colors = {
  sky: {
    100: '#F5FBFF',
    200: '#E6F6FF',
    300: '#D7F0FF',
    400: '#B8E5FF',
    600: '#80D1FF',
    800: '#36B6FF',
    900: '#0874BB',
  },
  ink: {
    900: '#0B2540',
    700: '#33475B',
    500: '#5E7185',
    300: '#9AA8B6',
  },
  plus: '#077A4C',
  minus: '#D93A3A',
  'review-bg': '#FFF4D6',
  'review-fg': '#8A5A00',
  'pending-bg': '#EEF2F5',
  'pending-fg': '#33475B',
  'done-bg': '#E3F6EC',
  'done-fg': '#0A6B44',
  line: '#E3EAF0',
  divider: '#EEF2F5',
  'input-line': '#D5DEE6',
} as const;

export const radius = { chip: 6, input: 8, button: 12, sheet: 16 } as const;

// 합류 순서 기준 순환.
export const AVATAR_COLORS = ['#80D1FF', '#FFD27A', '#A8E6C9', '#FFB3B3', '#C9D7FF'] as const;

export const MAX_FONT_SIZE_MULTIPLIER = 1.3;
