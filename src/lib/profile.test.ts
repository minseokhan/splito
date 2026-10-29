import { TERMS_VERSION, buildConsentUpdate, consentSchema, isConsentComplete, nicknameSchema } from './profile';

describe('nicknameSchema — trim 후 1~12자', () => {
  it.each([
    ['', false],
    ['   ', false],
    ['가'.repeat(12), true],
    ['가'.repeat(13), false],
    ['  민지  ', true],
  ])('%j → %s', (input, ok) => {
    expect(nicknameSchema.safeParse(input).success).toBe(ok);
  });

  it('trim한 값을 돌려준다', () => {
    expect(nicknameSchema.parse('  민지  ')).toBe('민지');
  });
});

describe('consentSchema', () => {
  const all = { terms: true, age14: true, overseas: true, marketing: false };

  it('필수 3개 true, 마케팅 false 허용', () => {
    expect(consentSchema.safeParse(all).success).toBe(true);
  });

  it.each(['terms', 'age14', 'overseas'] as const)('%s가 false면 실패', (key) => {
    expect(consentSchema.safeParse({ ...all, [key]: false }).success).toBe(false);
  });
});

describe('isConsentComplete', () => {
  const done = { terms_agreed_at: 't', age14_confirmed_at: 't', overseas_notice_ack_at: 't' };

  it('세 시각이 모두 있으면 true', () => {
    expect(isConsentComplete(done)).toBe(true);
  });

  it.each(['terms_agreed_at', 'age14_confirmed_at', 'overseas_notice_ack_at'] as const)('%s가 null이면 false', (key) => {
    expect(isConsentComplete({ ...done, [key]: null })).toBe(false);
  });
});

describe('buildConsentUpdate', () => {
  const now = new Date('2026-10-29T06:00:00.000Z');
  const iso = now.toISOString();

  it('필수 동의 시각·약관 버전을 기록하고 마케팅 true면 시각도 기록', () => {
    expect(buildConsentUpdate({ terms: true, age14: true, overseas: true, marketing: true }, now)).toEqual({
      terms_version: TERMS_VERSION,
      terms_agreed_at: iso,
      age14_confirmed_at: iso,
      overseas_notice_ack_at: iso,
      marketing_opt_in: true,
      marketing_opt_in_at: iso,
    });
  });

  it('마케팅 false면 marketing_opt_in_at은 null', () => {
    const u = buildConsentUpdate({ terms: true, age14: true, overseas: true, marketing: false }, now);
    expect(u.marketing_opt_in).toBe(false);
    expect(u.marketing_opt_in_at).toBeNull();
  });
});
