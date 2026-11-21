// docs/UI_GUIDE.md 토큰. NativeWind 클래스를 못 쓰는 곳(SVG, 아이콘 color prop)용.
// tailwind.config.js와 값이 같아야 한다(tokens.test.ts).
export const colors = {
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
} as const;

// 멤버 아바타 tint/fg. 합류 순서 기준 순환(민지·지훈·서연·엄마 순서가 시안 기준).
export const MEMBER_COLORS = [
  { tint: '#D8EFFF', fg: '#1272BF' },
  { tint: '#FFE7BF', fg: '#8A5300' },
  { tint: '#E6E3FF', fg: '#4B3FB5' },
  { tint: '#FFE2E8', fg: '#A8324F' },
] as const;

export const memberColor = (index: number) => MEMBER_COLORS[((index % MEMBER_COLORS.length) + MEMBER_COLORS.length) % MEMBER_COLORS.length];

export const MAX_FONT_SIZE_MULTIPLIER = 1.3;
