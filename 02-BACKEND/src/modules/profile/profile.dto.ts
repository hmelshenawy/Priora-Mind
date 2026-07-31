import { z } from 'zod';
import { isValidIanaTimezone } from './timezone.util';

/**
 * Profile / preferences DTOs + Zod schemas (contracts/profile-onboarding.md,
 * FR-009..FR-011). Only language + timezone are collected in this feature
 * (FR-009). Validation errors carry field paths only — never the submitted
 * value (FR-037). Language is the two first-class locales {ar, en} (FR-010);
 * timezone is a validated IANA name (FR-009).
 */

export type LanguageCode = 'ar' | 'en';

export const putProfileSchema = z.object({
  language_code: z.enum(['ar', 'en']),
  timezone: z.string().min(1).refine(isValidIanaTimezone, {
    message: 'INVALID_TIMEZONE',
  }),
});
export type PutProfileInput = z.infer<typeof putProfileSchema>;

export const putLanguageSchema = z.object({
  language_code: z.enum(['ar', 'en']),
});
export type PutLanguageInput = z.infer<typeof putLanguageSchema>;

/** Direction derived from the language code (FR-010). */
export function dirFor(language_code: LanguageCode): 'rtl' | 'ltr' {
  return language_code === 'ar' ? 'rtl' : 'ltr';
}

// ── response shapes ────────────────────────────────────────────────

export interface PreferencesView {
  language_code: LanguageCode;
  timezone: string;
}

export interface PutProfileResponse {
  profile: { created_at: string };
  preferences: PreferencesView;
  onboarding_state: 'ASSESSMENT_PENDING';
  next: '/assessment';
}

export interface PutLanguageResponse {
  language_code: LanguageCode;
  dir: 'rtl' | 'ltr';
}

export interface OnboardingStateResponse {
  onboarding_state: string;
  current_step: string | null;
  assessment_state: string | null;
  language_code: LanguageCode | null;
  requires_reconsent: boolean;
  next_route: string | null;
}

/**
 * Authoritative completion check (US9, FR-033, contracts/profile-onboarding.md
 * GET /onboarding/completion). `completed` is true ONLY when OnboardingState =
 * COMPLETED (excludes SAFETY_HOLD and every incomplete state). The frontend router
 * uses this boolean to bypass onboarding for returning completed users and route
 * incomplete users to their unfinished step. If the state cannot be determined
 * (no onboarding row), the service reports NOT_STARTED with completed:false — the
 * earliest unfinished step — fail-closed: never assume completion (US9 failure
 * path). `post_onboarding_route` is the transition-point destination (/dashboard).
 */
export interface OnboardingCompletionResponse {
  completed: boolean;
  onboarding_state: string;
  post_onboarding_route: '/dashboard';
}