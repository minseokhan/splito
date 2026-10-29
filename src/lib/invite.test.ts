import { INVITE_TOKEN_RE, buildInviteUrl, extractInviteToken, isPendingInviteValid, toSystemPath } from './invite';

const T = 'AbCdEfGhIjKlMnOpQr_-12'; // 22자
const D = 'splito.vercel.app';
const DAY = 24 * 60 * 60 * 1000;

describe('INVITE_TOKEN_RE', () => {
  it.each([
    [T, true],
    [T.slice(1), false], // 21자
    [T + 'x', false], // 23자
    ['AbCdEfGhIjKlMnOpQr+/12', false], // base64 비URL-safe 문자
    ['AbCdEfGhIjKlMnOpQr=12a', false],
    ['AbCdEfGhIjKlMnOpQr 12a', false],
  ])('%s → %s', (v, ok) => {
    expect(INVITE_TOKEN_RE.test(v)).toBe(ok);
  });
});

describe('buildInviteUrl', () => {
  it('https://{domain}/i/{token}', () => {
    expect(buildInviteUrl(D, T)).toBe(`https://${D}/i/${T}`);
  });
});

describe('extractInviteToken', () => {
  it.each([
    ['https URL', `https://${D}/i/${T}`],
    ['https URL + 쿼리', `https://${D}/i/${T}?utm=kakao`],
    ['https URL + 끝 슬래시', `https://${D}/i/${T}/`],
    ['splito:// URL', `splito://i/${T}`],
    ['splito:/// URL', `splito:///i/${T}`],
    ['경로만', `/i/${T}`],
    ['토큰만', T],
    ['앞뒤 공백', `  ${T}\n`],
    ['카톡 메시지 속 URL', `[스플리토] 오사카 여행에 초대받았어요!\nhttps://${D}/i/${T}\n눌러서 참여하세요`],
    ['도메인 대소문자', `https://SPLITO.Vercel.app/i/${T}`],
  ])('%s', (_, input) => {
    expect(extractInviteToken(input, D)).toBe(T);
  });

  it.each([
    ['다른 도메인', `https://evil.example/i/${T}`],
    ['비슷한 도메인', `https://${D}.evil.example/i/${T}`],
    ['서브도메인 위장', `https://evil-${D}/i/${T}`],
    ['http', `http://${D}/i/${T}`],
    ['다른 경로', `https://${D}/x/${T}`],
    ['짧은 토큰', `https://${D}/i/${T.slice(1)}`],
    ['긴 토큰', `https://${D}/i/${T}x`],
    ['토큰만 21자', T.slice(1)],
    ['6자리 코드', '123456'],
    ['빈 문자열', ''],
    ['다른 스킴', `foo://i/${T}`],
  ])('거부: %s', (_, input) => {
    expect(extractInviteToken(input, D)).toBeNull();
  });
});

describe('isPendingInviteValid', () => {
  const now = 1_800_000_000_000;
  it.each([
    ['null', null, false],
    ['방금', { token: T, savedAt: now }, true],
    ['24시간 - 1ms', { token: T, savedAt: now - DAY + 1 }, true],
    ['정확히 24시간', { token: T, savedAt: now - DAY }, false],
    ['24시간 초과', { token: T, savedAt: now - DAY - 1 }, false],
    ['미래 시각', { token: T, savedAt: now + 1000 }, false],
    ['잘못된 토큰', { token: 'bad', savedAt: now }, false],
  ])('%s', (_, p, ok) => {
    expect(isPendingInviteValid(p, now)).toBe(ok);
  });
});

describe('toSystemPath', () => {
  it.each([
    [`https://${D}/i/${T}`, `/i/${T}`],
    [`https://${D}/i/${T}/?utm=x`, `/i/${T}`],
    [`splito://i/${T}`, `/i/${T}`],
    [`/i/${T}`, `/i/${T}`],
  ])('초대 링크 %s → %s', (input, out) => expect(toSystemPath(input, D)).toBe(out));

  it.each(['splito://auth/callback?code=abc', '/auth/callback?code=abc', 'splito:///auth/callback'])(
    '로그인 콜백 %s는 그대로',
    (input) => expect(toSystemPath(input, D)).toBe(input),
  );

  it.each([
    `https://evil.com/i/${T}`,
    `http://${D}/i/${T}`,
    `/i/short`,
    `/i/${T}/extra`,
    T,
    '/rooms/123',
    'splito://rooms/123',
    '/auth/callbackX',
    '/',
    '',
  ])('허용 목록 밖 %s → /', (input) => expect(toSystemPath(input, D)).toBe('/'));
});
