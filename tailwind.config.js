/** @type {import('tailwindcss').Config} */
// 값은 docs/UI_GUIDE.md(디자인 핸드오프 splito-tokens.json)와 1:1. src/theme/tokens.ts와 같아야 한다(src/theme/tokens.test.ts가 검사).
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#36B6FF', text: '#0874BB', on: '#0B2B45', press: '#1FA3F0' },
        // 기본 sky 팔레트를 대체한다(extend 안이지만 객체 자체를 바꾼다).
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
      },
      borderRadius: {
        badge: '8px',
        chip: '10px',
        input: '14px',
        button: '16px',
        card: '20px',
        'card-lg': '24px',
        hero: '28px',
      },
      fontFamily: {
        sans: ['Pretendard-Regular'],
        medium: ['Pretendard-Medium'],
        semibold: ['Pretendard-SemiBold'],
        bold: ['Pretendard-Bold'],
        extrabold: ['Pretendard-ExtraBold'],
        wordmark: ['Fredoka-Bold'],
      },
    },
  },
  plugins: [],
};
