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

export type CoachingPlanStatus = 'PROPOSED' | 'ACTIVE' | 'COMPLETED';

export type CoachingGenerationStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'READY'
  | 'FAILED';

export type ActionStatus = 'INCOMPLETE' | 'COMPLETE';

export interface CoachingPlanProgress {
  completed: number;
  total: number;
}

export interface CoachingPlanSource {
  assessment_id: string;
  result_id: string;
  definition_version: string;
  library_version: string;
  disclaimer_version: string;
  prompt_version?: string;
}

export interface CoachingFocusAreaDto {
  id: string;
  domain: string;
  source: 'priority' | 'support' | 'lowest_band';
  position: number;
  reason: Bilingual;
}

export interface CoachingGoalDto {
  id: string;
  focus_area_id: string;
  library_key: string;
  position: number;
  copy: Bilingual;
}

export interface CoachingActionDto {
  id: string;
  focus_area_id: string;
  goal_id: string | null;
  library_key: string;
  position: number;
  pacing_label: Bilingual | null;
  copy: Bilingual;
  status: ActionStatus;
  version?: number;
}

export interface CoachingPlanResponse {
  plan_id: string;
  plan_version: number;
  generationStatus: 'READY';
  planStatus: CoachingPlanStatus;
  source: CoachingPlanSource;
  title: Bilingual;
  summary: Bilingual;
  disclaimer: Bilingual;
  focus_areas: CoachingFocusAreaDto[];
  goals: CoachingGoalDto[];
  actions: CoachingActionDto[];
  progress: CoachingPlanProgress;
}

export interface GenerationStatusResponse {
  plan_id: string;
  generationStatus: Exclude<CoachingGenerationStatus, 'READY'>;
}

export interface AcceptPlanResponse {
  plan_id: string;
  planStatus: CoachingPlanStatus;
}

export interface UpdateActionBody {
  status: ActionStatus;
  expected_version?: number;
}

export interface UpdateActionResponse {
  action: { id: string; status: ActionStatus; version: number };
  progress: CoachingPlanProgress;
  plan_status: CoachingPlanStatus;
}
