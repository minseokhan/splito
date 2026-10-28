/** @type {import('tailwindcss').Config} */
// 값은 docs/UI_GUIDE.md와 1:1. src/theme/tokens.ts와 같아야 한다(src/theme/tokens.test.ts가 검사).
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // 기본 sky 팔레트를 대체한다(extend 안이지만 객체 자체를 바꾼다).
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
      },
      borderRadius: {
        md: '6px', // 품목 박스·칩
        lg: '8px', // 지출 카드·입력
        xl: '12px', // 버튼·큰 카드
        sheet: '16px', // 바텀시트 상단
      },
      fontFamily: {
        sans: ['Pretendard-Regular'],
        medium: ['Pretendard-Medium'],
        semibold: ['Pretendard-SemiBold'],
        bold: ['Pretendard-Bold'],
      },
    },
  },
  plugins: [],
};
