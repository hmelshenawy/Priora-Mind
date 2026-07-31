/**
 * OnboardingService guard framework (task T013, FR-033).
 *
 * Interface only at the Foundational phase. US2/US3/US4 register concrete
 * `OnboardingStepRule`s that encode the journey ordering:
 *   consent (US2) → profile (US3) → assessment (US4) → result (US5) → dashboard (US9)
 * with SAFETY_HOLD (US6) gating completion. The guard is backend-enforced; it
 * decides whether a user may enter a given step given their current state.
 */

export type OnboardingStep =
  | 'boundary'
  | 'profile'
  | 'assessment'
  | 'result'
  | 'safety_hold'
  | 'dashboard';

export interface OnboardingGuardContext {
  userId: string;
  onboardingState: string;
  emailVerified: boolean;
  consentGranted: boolean;
}

/** A rule for one step: returns true if the user may enter it. */
export interface OnboardingStepRule {
  step: OnboardingStep;
  canEnter(ctx: OnboardingGuardContext): boolean;
}

/** DI token used to register the ordered rule set per the journey. */
export const ONBOARDING_RULES = Symbol('ONBOARDING_RULES');

/**
 * Backend guard service. The concrete implementation (added with the rules)
 * looks up the rule for the requested step and throws a 409/403-style error
 * when entry is not allowed, surfacing the correct "next step" for resumption
 * (US8/US9). Left abstract here; rules land in the story phases.
 */
export abstract class OnboardingGuardService {
  abstract assertCanEnter(step: OnboardingStep, ctx: OnboardingGuardContext): void;
  abstract nextStep(ctx: OnboardingGuardContext): OnboardingStep | null;
}