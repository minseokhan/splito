# Step 1: styling-tokens

## 읽어야 할 파일

- `/docs/UI_GUIDE.md` 전체 (색상 토큰, 타이포그래피, 반경, 금지 패턴)
- `/docs/ARCHITECTURE.md` §1(NativeWind 4.x), §2(`src/theme/tokens.ts`)
- `/docs/ADR.md` ADR-010
- 이전 step 산출물: `package.json`, `tsconfig.json`, `babel.config.js`, `app/_layout.tsx`, `app/index.tsx`

## 작업

NativeWind 4.x(Tailwind 3)와 디자인 토큰, 폰트, 아이콘을 설정한다.

1. 설치: `npx expo install nativewind react-native-reanimated react-native-safe-area-context` + `npm i -D tailwindcss@^3`. `lucide-react-native`, `react-native-svg`(`npx expo install`).
2. NativeWind 4 공식 설정을 따른다: `tailwind.config.js`(content: `app/**`, `src/**`, preset `nativewind/preset`), `global.css`, `babel.config.js`(`jsxImportSource: "nativewind"`, `nativewind/babel`), `metro.config.js`(`withNativeWind`), `nativewind-env.d.ts`.
3. `tailwind.config.js`의 `theme.extend.colors`에 UI_GUIDE 토큰을 1:1로 넣는다:
   - `sky`: `100 #F5FBFF`, `200 #E6F6FF`, `300 #D7F0FF`, `400 #B8E5FF`, `600 #80D1FF`, `800 #36B6FF`, `900 #0874BB`
   - `ink`: `900 #0B2540`, `700 #33475B`, `500 #5E7185`, `300 #9AA8B6`
   - 시맨틱: `plus #077A4C`, `minus #D93A3A`, `review-bg #FFF4D6`, `review-fg #8A5A00`, `pending-bg #EEF2F5`, `pending-fg #33475B`, `done-bg #E3F6EC`, `done-fg #0A6B44`, `line #E3EAF0`, `divider #EEF2F5`, `input-line #D5DEE6`
   - `borderRadius`: 버튼·큰 카드 12, 지출 카드·입력 8, 품목 박스·칩 6, 바텀시트 16.
   - Tailwind 기본 `sky` 팔레트를 **대체**한다(기본 sky-800은 다른 색이다).
4. `src/theme/tokens.ts`: 같은 값을 TS 상수로 export 한다(아바타 색 순환 `AVATAR_COLORS = ['#80D1FF','#FFD27A','#A8E6C9','#FFB3B3','#C9D7FF']` 포함). NativeWind 클래스를 쓸 수 없는 곳(SVG, 아이콘 color prop)에서 쓴다.
5. Pretendard 폰트: `assets/fonts/`에 Pretendard Regular·Medium·SemiBold·Bold OTF를 넣고 `expo-font`로 `_layout.tsx`에서 로드한다. 폰트 파일은 Pretendard 공식 릴리스(OFL)에서 받는다. 받을 수 없으면 `blocked`, `blocked_reason: "Pretendard 폰트 파일 필요"`.
   - `app.json`/`_layout`에서 `Text` 최대 배율은 1.3(`maxFontSizeMultiplier`)으로 둔다.
6. `app/index.tsx`를 `bg-sky-100` 배경 + `text-ink-900` 텍스트로 바꿔 NativeWind 동작을 확인할 수 있게 한다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
npx expo export -p android
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/0-setup/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- NativeWind v5(RC)나 Tailwind 4를 쓰지 마라. 이유: ARCHITECTURE §1에서 4.x + Tailwind 3으로 고정했다.
- UI_GUIDE에 없는 색(보라·인디고, 그라데이션)을 토큰에 넣지 마라. 이유: UI_GUIDE 안티패턴.
- `sky-800` 위 흰 글자 조합을 만들지 마라. 이유: 대비 2.26:1.
- 공용 Button·Card 컴포넌트를 미리 만들지 마라. 이유: 이 step 범위가 아니다. 필요한 phase에서 만든다.
