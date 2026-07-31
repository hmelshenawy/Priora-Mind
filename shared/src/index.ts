/**
 * @priora/shared-types
 *
 * Cross-stack DTOs shared between the NestJS backend and the Next.js frontend.
 * Keep this module free of runtime logic and framework dependencies — types only.
 *
 * Feature 001 scope: onboarding & assessment. New DTOs are added per user story
 * (US1–US9). Until those land, this module re-exports the shared enums that both
 * stacks need (safety levels, onboarding/assessment states, language codes).
 */

export type LanguageCode = 'en' | 'ar';

export type SafetyLevel = 'NORMAL' | 'DISTRESS' | 'HIGH_RISK' | 'CRISIS';

export type OnboardingState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'ASSESSMENT_PENDING'
  | 'SAFETY_HOLD'
  | 'COMPLETED';

export type AssessmentState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUSPENDED'
  | 'INTERRUPTED'
  | 'SUBMITTED'
  | 'SCORED';

/** Bilingual string container (Constitution X: AR and EN are first-class equals). */
export interface Bilingual {
  en: string;
  ar: string;
}