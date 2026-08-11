import { z } from 'zod';

/**
 * Consent DTOs / Zod schemas (contracts/consent.md, Consent policy §4/§5).
 *
 * The POST body carries the notice version identifiers the user is acknowledging
 * plus the three separate acknowledgments (Consent §4 — never preselected, each
 * must be explicitly true). The record MUST NOT contain assessment/safety answers
 * or copied notice text (Consent §5); only version ids + language + channel + ts.
 */

export const noticesQuerySchema = z.object({
  lang: z.enum(['ar', 'en']).optional(),
});
export type NoticesQuery = z.infer<typeof noticesQuerySchema>;

export const recordConsentSchema = z.object({
  service_boundary_version: z.string().min(1),
  terms_version: z.string().min(1),
  privacy_notice_version: z.string().min(1),
  acknowledgments: z.object({
    service_boundary: z.boolean(),
    terms: z.boolean(),
    privacy_notice: z.boolean(),
  }),
  consent_language_code: z.enum(['ar', 'en']),
  product_channel_id: z.string().min(1).default('priora-mind-web'),
});
export type RecordConsentInput = z.infer<typeof recordConsentSchema>;

/** Bilingual text/link pair (contracts/consent.md GET /onboarding/notices). */
export interface BilingualEntry {
  en: string;
  ar: string;
}

export interface NoticesResponse {
  service_boundary_version: string;
  terms_version: string;
  privacy_notice_version: string;
  service_boundary_text: BilingualEntry;
  terms_link: BilingualEntry;
  privacy_notice_link: BilingualEntry;
  required_acknowledgments: ['service_boundary', 'terms', 'privacy_notice'];
}

export interface VersionSet {
  service_boundary_version: string;
  terms_version: string;
  privacy_notice_version: string;
}

export interface ConsentStatusResponse {
  has_granted: boolean;
  requires_reconsent: boolean;
  current_versions: VersionSet;
  recorded_versions: VersionSet | null;
  consent_language_code: 'ar' | 'en' | null;
}

export interface RecordConsentResponse {
  consent_record_id: string;
  granted_at: string;
  onboarding_state: 'IN_PROGRESS';
  next: '/onboarding/profile';
}