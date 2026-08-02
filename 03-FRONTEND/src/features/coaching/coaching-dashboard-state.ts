import type { CoachingPlanApiResponse } from './coaching.api';
import type { Bilingual, CoachingPlanResponse, LanguageCode } from '@priora/shared-types';

export type CoachingDashboardView =
  | 'loading'
  | 'startable'
  | 'starting'
  | 'pending'
  | 'generating'
  | 'failedRetryable'
  | 'unavailable'
  | 'noAssessment'
  | 'safetyHold'
  | 'ineligible'
  | 'notReady'
  | 'notActive'
  | 'readyProposed'
  | 'readyActive'
  | 'readyCompleted'
  | 'error';

export interface DashboardErrorLike {
  code: string;
  status?: number;
  retryable?: boolean;
  reason?: string;
}

export function shouldPollPlan(data: CoachingPlanApiResponse | undefined): boolean {
  return data?.generationStatus === 'PENDING' || data?.generationStatus === 'GENERATING';
}

export function selectBilingualText(value: Bilingual, locale: string): string {
  return value[(locale === 'ar' ? 'ar' : 'en') as LanguageCode] || value.en || value.ar;
}

export function resolveDashboardView(input: {
  data?: CoachingPlanApiResponse;
  error?: DashboardErrorLike | null;
  startPending?: boolean;
}): CoachingDashboardView {
  const { data, error, startPending } = input;
  if (error) {
    if (error.code === 'PLAN_NOT_FOUND') return startPending ? 'starting' : 'startable';
    if (error.code === 'RESULT_NOT_FOUND' || error.reason === 'RESULT_NOT_FOUND') return 'noAssessment';
    if (error.code === 'SAFETY_HOLD') return 'safetyHold';
    if (error.code === 'ONBOARDING_STEP_BLOCKED') return 'ineligible';
    if (error.code === 'PLAN_NOT_READY') return 'notReady';
    if (error.code === 'PLAN_NOT_ACTIVE') return 'notActive';
    if (error.code === 'PLAN_UNAVAILABLE') return error.retryable ? 'failedRetryable' : 'unavailable';
    return 'error';
  }
  if (!data) return 'loading';
  if (data.generationStatus === 'PENDING') return 'pending';
  if (data.generationStatus === 'GENERATING') return 'generating';
  if (data.generationStatus === 'FAILED') return 'failedRetryable';
  const ready = data as CoachingPlanResponse;
  if (ready.planStatus === 'PROPOSED') return 'readyProposed';
  if (ready.planStatus === 'ACTIVE') return 'readyActive';
  return 'readyCompleted';
}
