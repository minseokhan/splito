# Step 4: web-static

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §2 `web/`, §4 웹 랜딩(CSP·Referrer-Policy), §6.2
- `/docs/ADR.md` ADR-008
- `/docs/PRD.md` §7.3 국외 이전 고지 항목(처리방침에 들어갈 내용)
- `/docs/UI_GUIDE.md` 색상(랜딩도 같은 토큰)
- 이전 phase 산출물: `app.config.ts`(bundleIdentifier·package·LINK_DOMAIN)

## 작업

Vercel 정적 사이트 `web/`을 만든다. 빌드 도구 없이 순수 HTML/CSS.

1. `web/.well-known/apple-app-site-association`(확장자 없음, JSON): `applinks.details[].appIDs = ["<TEAM_ID>.app.splito"]`, `components: [{"/": "/i/*"}]`. TEAM_ID는 자리표시자 문자열 `TEAMID_PLACEHOLDER`로 두고 README 주석 대신 manual QA에서 교체한다.
2. `web/.well-known/assetlinks.json`: `package_name: "app.splito"`, `sha256_cert_fingerprints: ["SHA256_PLACEHOLDER"]`.
3. `web/i/index.html`: 고정 문구 "스플리토 여행에 초대받았어요" + "앱에서 열기" 안내. 방 정보를 조회하지 않는다. 인라인 스크립트 금지(CSP `script-src 'self'`). 다운로드·클립보드 버튼은 8-install-join phase가 추가한다.
4. `web/terms.html`, `web/privacy.html`: 초안. privacy에는 PRD §7.3 국외 이전 항목(이전 항목·국가·시기·방법·이전받는 자·목적·보유 기간·거부 방법), 사진 EXIF 제거·보관 1년, 계좌 암호화, 탈퇴 시 익명화를 적는다. 상단에 "초안 — 출시 전 법률 검토 필요" 표시.
5. `web/vercel.json`
   - rewrites: `/i/:token` → `/i/index.html`
   - headers: 전체 `Content-Security-Policy: default-src 'self'; script-src 'self'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. AASA는 `Content-Type: application/json`.

## Acceptance Criteria

```bash
node -e "for (const f of ['web/vercel.json','web/.well-known/assetlinks.json','web/.well-known/apple-app-site-association']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('ok')"
npm run lint && npm run build && npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/3-rooms/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 랜딩에서 Supabase·anon API를 호출하거나 방 이름을 보여주지 마라. 이유: ADR-008, XSS·공개 API 제거.
- `/i/*`에 분석 스크립트(GA 등)를 넣지 마라. 이유: 토큰 유출(ARCHITECTURE §4).
- Next.js 등 프레임워크를 도입하지 마라. 이유: 정적 파일 몇 개로 충분하다.
- `vercel deploy`를 실행하지 마라. 이유: 외부 계정. manual QA에서 사람이 한다.
