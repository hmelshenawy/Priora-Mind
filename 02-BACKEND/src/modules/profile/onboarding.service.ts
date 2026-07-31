import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  type OnboardingGuardContext,
  type OnboardingGuardService,
  type OnboardingStep,
} from './onboarding.guard';

/**
 * Backend onboarding guard (T013 framework, T033 rules; FR-002/FR-006/FR-008/
 * FR-033). Pure over a provided `OnboardingGuardContext` — the caller (US3/US4
 * route handlers) builds the context from `UserAccount.status` (emailVerified)
 * and `ConsentService.hasGrantedCurrentConsent` (consent granted for the current
 * NoticeVersionSet). Keeping the guard pure makes the step-ordering rules fully
 * unit-testable with no DB/AI (Constitution IX).
 *
 * Journey ordering enforced here:
 *   boundary (emailVerified) → profile (emailVerified + consent) → assessment
 *   (emailVerified + consent) → result/dashboard (refined in US5/US9) with
 *   SAFETY_HOLD (US6) gating completion. Rules for result/dashboard/safety_hold
 *   are forward-looking stubs refined by their stories; they never relax the
 *   emailVerified + consent floor.
 */
@Injectable()
export class OnboardingGuardServiceImpl implements OnboardingGuardService {
  private readonly rules: Record<OnboardingStep, (ctx: OnboardingGuardContext) => boolean> = {
    boundary: (ctx) => ctx.emailVerified,
    profile: (ctx) => ctx.emailVerified && ctx.consentGranted,
    assessment: (ctx) => ctx.emailVerified && ctx.consentGranted,
    // Refined in US5/US6/US9; the consent floor is never relaxed.
    result: (ctx) => ctx.emailVerified && ctx.consentGranted,
    safety_hold: (ctx) => ctx.emailVerified && ctx.consentGranted,
    dashboard: (ctx) => ctx.emailVerified && ctx.consentGranted,
  };

  assertCanEnter(step: OnboardingStep, ctx: OnboardingGuardContext): void {
    const allowed = this.rules[step]?.(ctx) ?? false;
    if (!allowed) {
      throw new HttpException(
        { error: { code: 'ONBOARDING_STEP_BLOCKED', next: this.nextStep(ctx) } },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  nextStep(ctx: OnboardingGuardContext): OnboardingStep | null {
    if (!ctx.emailVerified) return null; // verify via email link, not an onboarding step
    if (!ctx.consentGranted) return 'boundary';
    // Journey routing from the persisted OnboardingState (data-model §7).
    switch (ctx.onboardingState) {
      case 'NOT_STARTED':
      case 'IN_PROGRESS':
        return 'profile';
      case 'ASSESSMENT_PENDING':
      case 'ASSESSMENT_IN_PROGRESS':
        return 'assessment';
      case 'ASSESSMENT_SUBMITTED':
        return 'result'; // US5 presents the result → COMPLETED
      case 'COMPLETED':
        return 'dashboard'; // US9: completed users bypass onboarding
      case 'SAFETY_HOLD':
        return 'safety_hold'; // US6
      default:
        return 'profile';
    }
  }
}