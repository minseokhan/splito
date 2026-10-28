# Step 0: landing-download

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §4 웹 랜딩, §6.2 미설치 경로(해커톤: 내부 배포 링크 + 클립보드)
- `/docs/ADR.md` ADR-008 트레이드오프
- `/docs/USER_FLOWS.md` J2 분기 C
- 이전 phase 산출물: `web/i/index.html`, `web/vercel.json`

## 작업

웹 랜딩에 [앱 받기]를 추가한다. 누르면 현재 초대 링크를 클립보드에 복사하고 내부 배포 링크로 이동한다.

1. `web/i/landing.js`(외부 파일 — CSP `script-src 'self'` 때문에 인라인 금지)
   - `location.pathname`에서 토큰을 꺼내 `^[A-Za-z0-9_-]{22}$` 검증. 실패하면 버튼 숨김.
   - [앱 받기] 클릭 → `navigator.clipboard.writeText(location.href)` → 플랫폼별(`navigator.userAgent`) 다운로드 URL로 이동.
   - 다운로드 URL은 파일 상단 상수 `ANDROID_URL`, `IOS_URL`(자리표시자 문자열 — manual QA에서 EAS 내부 배포 링크로 교체).
2. `web/i/index.html`: 안내 문구 "앱을 설치한 뒤 처음 화면에서 [초대 링크 붙여넣기]를 눌러 주세요" + [앱 받기] 버튼 + `<script src="/i/landing.js" defer>`.
3. 토큰을 서버·분석 도구로 보내지 않는다.

## Acceptance Criteria

```bash
node --check web/i/landing.js
node -e "JSON.parse(require('fs').readFileSync('web/vercel.json','utf8'))"
npm run lint && npm run build && npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/8-install-join/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 인라인 `<script>`나 `onclick` 속성을 쓰지 마라. 이유: CSP `script-src 'self'`.
- 방 정보를 조회하지 마라. 이유: ADR-008.
- Play Install Referrer용 `referrer=` 파라미터 처리를 만들지 마라. 이유: 스토어 출시 후(해커톤은 클립보드만).
