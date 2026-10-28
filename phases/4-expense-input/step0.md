# Step 0: fx-rate-function

## 읽어야 할 파일

- `/docs/PRD.md` §7.1 환율 확정 정책 전체
- `/docs/ARCHITECTURE.md` §4 Edge Function·비밀값, §5.2 `fx-rate` 행, §9 `fx-rate` Deno test 케이스
- `/docs/ADR.md` ADR-009
- 이전 phase 산출물: `supabase/migrations/*_schema.sql`(`fx_rates` 테이블), `supabase/migrations/*_save_expense.sql`(`_lookup_fx`)

## 작업

수출입은행 환율을 하루치 전 통화 단위로 캐시하는 Edge Function을 만든다. Deno test 먼저.

파일
- `supabase/functions/_shared/auth.ts`: 요청의 `Authorization` JWT로 사용자 클라이언트를 만들고 `auth.getUser()`로 검증. 실패 시 401 `{error:{code:'AUTH_EXPIRED'}}`.
- `supabase/functions/_shared/http.ts`: `json(body, status)`, `errorResponse(code, status)`. 에러 로그는 `code`·`room_id`만.
- `supabase/functions/fx-rate/index.ts` — 핸들러(`Deno.serve`)는 얇게, 로직은 `fx.ts`로.
- `supabase/functions/fx-rate/fx.ts`
  ```ts
  export function normalizeKeximRows(rows: KeximRow[]): Map<string, number>;   // cur_unit 'JPY(100)'·'IDR(100)' → /100, deal_bas_r '1,328.5' 쉼표 제거, CNH → CNY 키로 저장
  export function kstToday(now: Date): string;                                 // YYYY-MM-DD (Asia/Seoul)
  export async function resolveRate(deps: { now: Date; readCache(date): Promise<Map|null>; fetchDay(date): Promise<KeximRow[]|null>; writeCache(date, map): Promise<void> },
                                    date: string, currency: string)
    : Promise<{ base_date: string; rate: number; source: 'kexim' } | { status: 'pending' | 'unsupported' } | { base_date: string; rate: 1; source: 'krw' }>;
  ```
- `supabase/functions/fx-rate/fx.test.ts`

규칙
- 요청 `{date, currency}`. `currency === 'KRW'` → rate 1, source 'krw'.
- `date > kstToday` → pending.
- 날짜부터 하루씩 거슬러 최대 10일(포함 범위는 `save_expense`의 `_lookup_fx`와 동일: date-10 ~ date). 각 날짜는 캐시 → 없으면 API 1회 → 응답이 비어 있으면(휴일) 다음 날짜.
- 오늘인데 고시 전(빈 응답)이고 그 이전도 못 찾으면 pending. SSL·네트워크 실패도 pending(예외 throw 금지).
- 고시일 데이터에 그 통화가 없으면 unsupported.
- API: `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${KEXIM_API_KEY}&searchdate=YYYYMMDD&data=AP01`.
- 캐시 쓰기는 service role 클라이언트로 `fx_rates`에 하루치 전 통화 upsert(이 함수와 delete-account만 service role 사용).
- 응답 `{base_date, rate, source}` 또는 `{status}`. rate는 소수 6자리까지.

Deno test(외부 호출 없이 deps 주입): JPY(100)·IDR(100) 정규화, 쉼표 파싱, CNY→CNH 매핑, 주말·연휴 거슬러 찾기, 11일째 pending, 고시 전 pending, 미래 날짜 pending, KRW, fetch 실패 pending, 미고시 통화 unsupported, 같은 날 두 번째 요청은 fetch 0회(캐시).

## Acceptance Criteria

```bash
deno test supabase/functions/fx-rate/
npm run lint && npm run build && npm test
```

`deno`가 없으면 `blocked`, `blocked_reason: "deno 미설치 — brew install deno 필요"`.

## 검증 절차

1. 위 AC 커맨드를 실행한다. `supabase` 명령이 있는 AC에서 Docker가 없으면(`docker info` 실패) 파일 작성까지 마치고 `"status": "blocked"`, `"blocked_reason": "Docker 없음 — supabase db reset && supabase test db 미검증"`으로 중단한다.
2. 아키텍처 체크리스트를 확인한다:
   - `docs/ARCHITECTURE.md` §2 디렉토리 구조와 `CLAUDE.md` 폴더 역할(app은 조합만, src/lib는 순수 로직 + TDD)을 따르는가?
   - `docs/ADR.md` 기술 스택을 벗어나지 않았는가? 이 step에 적힌 것 외의 새 의존성을 추가하지 않았는가?
   - `CLAUDE.md` CRITICAL 규칙(정수 원·floor, 장부 쓰기는 RPC로만, room_balances가 유일한 정답, 비밀값 위치, 새 테이블 RLS+pgTAP, EXIF 제거)을 위반하지 않았는가?
3. 결과에 따라 `phases/4-expense-input/index.json`의 이 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."` — 다음 step이 쓸 수 있게 생성·수정한 파일 경로와 핵심 시그니처를 한 줄로 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(API 키, 외부 계정, 실기기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 테스트에서 실제 수출입은행 API를 호출하지 마라. 이유: 키가 필요하고 일일 한도(1,000회)가 있다.
- API 키를 코드·로그에 남기지 마라. `Deno.env.get('KEXIM_API_KEY')`만. 이유: CLAUDE.md CRITICAL.
- 원화 금액을 이 함수에서 계산하지 마라. 이유: 원화 확정은 `save_expense`(서버 SQL)만 한다.
- cron 자동 재시도를 만들지 마라. 이유: P2.
