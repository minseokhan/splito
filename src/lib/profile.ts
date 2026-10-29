import { z } from 'zod';

import type { Tables, TablesUpdate } from '../types/database';

type Profile = Tables<'profiles'>;

export const TERMS_VERSION = '2026-10-28';

export const nicknameSchema = z.string().trim().min(1).max(12);

export const consentSchema = z.object({
  terms: z.literal(true),
  age14: z.literal(true),
  overseas: z.literal(true),
  marketing: z.boolean(),
});

export type ConsentInput = z.infer<typeof consentSchema>;

export type ProfileConsentUpdate = Required<
  Pick<
    TablesUpdate<'profiles'>,
    'terms_version' | 'terms_agreed_at' | 'age14_confirmed_at' | 'overseas_notice_ack_at' | 'marketing_opt_in' | 'marketing_opt_in_at'
  >
>;

export function isConsentComplete(
  p: Pick<Profile, 'terms_agreed_at' | 'age14_confirmed_at' | 'overseas_notice_ack_at'>,
): boolean {
  return p.terms_agreed_at != null && p.age14_confirmed_at != null && p.overseas_notice_ack_at != null;
}

export function buildConsentUpdate(input: ConsentInput, now: Date): ProfileConsentUpdate {
  const at = now.toISOString();
  return {
    terms_version: TERMS_VERSION,
    terms_agreed_at: at,
    age14_confirmed_at: at,
    overseas_notice_ack_at: at,
    marketing_opt_in: input.marketing,
    marketing_opt_in_at: input.marketing ? at : null,
  };
}
