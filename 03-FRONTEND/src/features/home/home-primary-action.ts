import type { HomeDashboardState } from './home-dashboard-state';

export type PrimaryAction =
  | 'accept-plan'
  | 'continue-plan'
  | 'review-completed-plan'
  | 'retry'
  | 'none';

/**
 * FR-035 primary-action rule. No-plan states (`startable`/`firstRun`) map to `none`
 * — generation is triggered by the single automatic generation flow (the preserved
 * Spec 002 auto-start effect, AD-7), so the Home Dashboard renders NO competing
 * Generate CTA. `failedRetryable` keeps the explicit Retry action (FR-007); READY
 * states keep their guidance-label actions (CoachingPlanView owns the primary action,
 * AD-2/AD-4).
 */
export function resolvePrimaryAction(state: HomeDashboardState): PrimaryAction {
  switch (state) {
    case 'readyProposed':
      return 'accept-plan';
    case 'readyActive':
      return 'continue-plan';
    case 'readyCompleted':
      return 'review-completed-plan';
    case 'failedRetryable':
      return 'retry';
    // startable / firstRun / starting / pending / generating / unavailable /
    // noAssessment / safetyHold / ineligible / notReady / notActive / error / loading
    default:
      return 'none';
  }
}
