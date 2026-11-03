/** @type {import('tailwindcss').Config} */
// 값은 docs/UI_GUIDE.md(디자인 핸드오프 splito-tokens.json)와 1:1. src/theme/tokens.ts와 같아야 한다(src/theme/tokens.test.ts가 검사).
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // 대표색은 네이비(#1D3C8F). 흰 배경 위 글자·아이콘도 같은 값을 쓴다.
        primary: { DEFAULT: '#1D3C8F', text: '#1D3C8F', on: '#FFFFFF', press: '#16306F' },
        // 하늘색 팔레트 자리를 네이비 틴트로 바꾼다(키 이름은 호출부 33곳 때문에 유지).
        // 50=bgAlt, 100=primarySoft, 200=primaryBorder(테두리·눌림), 300=primarySoft2(중간 틴트).
        sky: { 50: '#F3F6FB', 100: '#E8EEF8', 200: '#C2CFE8', 300: '#DCE4F3' },
        ink: { DEFAULT: '#0E1B3D', alt: '#0E2A47', 700: '#353A47', 500: '#535764', 400: '#6B7080', 300: '#A0A4AE' },
        app: '#F6F8FA',
        muted: '#F0F3F7',
        line: { DEFAULT: '#E4E7EC', off: '#D0D5DD', row: '#E9EDF2' },
        danger: { DEFAULT: '#D92D20', soft: '#FDA29B', text: '#C4320A' },
        success: { DEFAULT: '#0B7D6C', bg: '#E3F8F2', badge: '#DDF8F1', icon: '#7CF0D8' },
        // accent·bar는 내 통계 예산 카드 전용(오늘 남은 금액 숫자 / 진행 바).
        warning: { DEFAULT: '#A35A00', bg: '#FFF4D6', badge: '#FFF1CC', banner: '#FFF8E1', line: '#FFD873', deep: '#5A3A00', accent: '#C98A00', bar: '#F5B400' },
        // 외화 금액은 현지 통화를 크게 local, 원화를 작게 ink-300으로 쓴다.
        local: '#1D3C8F',
        tagline: '#4E6378',
        alert: '#F04452',
        kakao: { DEFAULT: '#FEE500', text: '#191600' },
        naver: '#03C75A',
        'on-dark-sub': '#B8C0CC',
        // 정산 화면 세그먼트 탭(프로토타입 1a 실측).
        tab: { bg: '#EEF2F9', num: '#1D3C8F', 'num-off': '#9CADD9' },
        'card-line': '#ECEEF2',
        // 내 통계 화면 배경 / 오늘 금액 박스 바탕.
        stats: { bg: '#F5F7FB', box: '#F7F8FB', line: '#D2DCEF' },
      },
      borderRadius: {
        badge: '8px',
        chip: '12px',
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
      },
    },
  },
  plugins: [],
};
