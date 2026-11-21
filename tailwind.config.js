/** @type {import('tailwindcss').Config} */
// 값은 docs/UI_GUIDE.md(디자인 핸드오프 splito-tokens.json)와 1:1. src/theme/tokens.ts와 같아야 한다(src/theme/tokens.test.ts가 검사).
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // 2026-11-20 스카이 & 민트 팔레트(핸드오프 handoff/2026-11-20-color, 노션 UI 업데이트 20번).
        // primary = 주요 버튼 배경(스카이 600), primary-text = 링크·강조·외화(스카이 700).
        primary: { DEFAULT: '#1A8FE6', text: '#1272BF', on: '#FFFFFF', press: '#1272BF' },
        // 키 이름은 호출부 때문에 유지. 50=요약 카드·틴트, 100=연한 강조 칩, 200=호버 테두리·막대, 300=중간 틴트.
        sky: { 50: '#EEF8FF', 100: '#D8EFFF', 200: '#B0DFFF', 300: '#D8EFFF', 400: '#59BDFF', 500: '#33ABFF', 600: '#1A8FE6', 700: '#1272BF' },
        mint: { 50: '#EAFBF6', 100: '#CCF5E9', 600: '#10A587', 700: '#0C846D' },
        ice: '#F4FAFF',
        // ink=본문(ink), 700=진한 보조, 500·400=보조(600), 300=비활성(500).
        ink: { DEFAULT: '#17203A', alt: '#17203A', 700: '#3D465C', 500: '#5B6478', 400: '#5B6478', 300: '#8A92A3' },
        // 회색 박스·입력칸(뉴트럴 50). 화면 배경은 흰색이 기본(확인하고 나누기·말로 입력만 app).
        app: '#F8F9FB',
        muted: '#F1F3F6',
        line: { DEFAULT: '#E4E7ED', off: '#C9CED8', row: '#F1F3F6' },
        danger: { DEFAULT: '#D92148', soft: '#FDA29B', text: '#D92148', bg: '#FDE8EF' },
        success: { DEFAULT: '#10A587', bg: '#EAFBF6', badge: '#EAFBF6', icon: '#7CF0D8' },
        info: { DEFAULT: '#12A877', bg: '#E6F7F0' },
        // accent·bar는 내 통계 예산 카드 전용(오늘 남은 금액 숫자 / 진행 바).
        // spot·spot-text는 '이 자리 정산' 상태 줄 전용. 핸드오프 토큰에 없고 프로토타입 실측값이다.
        warning: { DEFAULT: '#E89400', text: '#B87400', bg: '#FFF5DC', badge: '#FFF5DC', banner: '#FFF5DC', line: '#FFD873', deep: '#5A3A00', accent: '#E89400', bar: '#F5B400', spot: '#FFF5DC', 'spot-text': '#7A4B00' },
        // 외화 금액은 현지 통화를 크게 local, 원화를 작게 ink-300으로 쓴다.
        local: '#1272BF',
        tagline: '#4E6378',
        alert: '#F04452',
        kakao: { DEFAULT: '#FEE500', text: '#191600' },
        naver: '#03C75A',
        'on-dark-sub': '#C9CED8',
        // 정산 화면 세그먼트 탭.
        tab: { bg: '#EEF8FF', num: '#1272BF', 'num-off': '#80CCFF' },
        'card-line': '#F1F3F6',
        // 내 통계 화면 배경 / 오늘 금액 박스 바탕.
        stats: { bg: '#F8F9FB', box: '#F8F9FB', line: '#B0DFFF' },
        pass: { star: '#F2B705', from: '#2A4FB0', to: '#0E2A6B', sub: '#C9D4F2' },
        // 카테고리 컬러(uploads/splito-category-colors.css). bg=아이콘 원, icon=아이콘, chart=내 통계 그래프. 글자에는 쓰지 않는다.
        cat: {
          food: { bg: '#FFF1E6', icon: '#D25F10', chart: '#F28C38' },
          transport: { bg: '#E7F1FF', icon: '#1F6FD1', chart: '#4C8DEB' },
          shopping: { bg: '#FFECF2', icon: '#C2356A', chart: '#E8638F' },
          sightseeing: { bg: '#F1ECFF', icon: '#6A45D4', chart: '#8B6CF0' },
          lodging: { bg: '#E6F6EF', icon: '#0B7D6C', chart: '#2FA98C' },
          other: { bg: '#EEF1F5', icon: '#5B6475', chart: '#9AA3B2' },
        },
      },
      borderRadius: {
        // 2026-11-20 둥글기 토큰(노션 UI 업데이트 14번): 28 홈 카드 / 20 시트·일반 큰 카드 / 16 요약·날짜 묶음·회색 박스 / 12 버튼·입력 / 10 토글 / 8 태그.
        badge: '8px',
        toggle: '10px',
        chip: '12px',
        input: '12px',
        button: '12px',
        box: '16px',
        card: '20px',
        'card-lg': '16px',
        sheet: '20px',
        hero: '28px',
      },
      // 원본(1a) body line-height 1.6을 글자 크기마다 박는다(RN Text에는 전역 행간이 없다). 값 = 크기 × 1.6 반올림.
      // 다른 행간이 필요하면 leading-* 클래스가 이긴다.
      fontSize: {
        10: ['10px', '16px'],
        11: ['11px', '18px'],
        xs: ['12px', '19px'],
        13: ['13px', '21px'],
        sm: ['14px', '22px'],
        15: ['15px', '24px'],
        base: ['16px', '26px'],
        17: ['17px', '27px'],
        lg: ['18px', '29px'],
        19: ['19px', '30px'],
        xl: ['20px', '32px'],
        22: ['22px', '35px'],
        '2xl': ['24px', '38px'],
        26: ['26px', '42px'],
        28: ['28px', '45px'],
        30: ['30px', '48px'],
        // 입력칸 전용: 행간 없음. iOS 한 줄 TextInput에 행간이 붙으면 글자·placeholder가 아래로 처진다(커서는 위).
        'input-15': '15px',
        'input-16': '16px',
        'input-17': '17px',
        'input-18': '18px',
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
