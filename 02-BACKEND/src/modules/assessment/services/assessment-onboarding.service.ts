import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConsentService } from '../../auth/consent.service';
import {
  OnboardingGuardService,
  type OnboardingGuardContext,
} from '../../profile/onboarding.guard';

/**
 * Shared Assessment ↔ onboarding-state interactions. Both the lifecycle and
 * submit services need to (a) assert the OnboardingGuard allows entry to the
 * 'assessment' step (EMAIL_VERIFIED + consent, FR-006) and (b) transition the
 * OnboardingState row when an assessment milestone is reached. The entry guard
 * + context assembly were verbatim-identical across both orchestrators; the
 * transition differed only in which predecessor states permit the target.
 *
 * This service holds those shared interactions so each orchestrator owns only
 * its own orchestration (Constitution VIII split). No behavior changes: the
 * bodies are verbatim copies of the former private methods, with the per-caller
 * predecessor list passed in by the caller — each caller's transition semantics
 * are preserved exactly.
 */
@Injectable()
export class AssessmentOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly guard: OnboardingGuardService,
  ) {}

  /** Build the guard context and assert the user may enter 'assessment'
   *  (EMAIL_VERIFIED is enforced by the route guard; consent is checked here). */
  async assertCanEnter(userId: string): Promise<void> {
    const ctx = await this.contextFor(userId);
    this.guard.assertCanEnter('assessment', ctx);
  }

  /** Transition onboarding to `target` only when the current state is one of
   *  `allowedPredecessors`; otherwise leave the state unchanged. Updates
   *  currentStep/updatedAt/lastActivityAt. No-op when no OnboardingState row
   *  exists. Each caller passes its own predecessor list — the per-caller
   *  transition semantics are unchanged. */
  async transitionOnboarding(
    userId: string,
    allowedPredecessors: readonly string[],
    target: string,
    now: Date,
  ): Promise<void> {
    const existing = await this.prisma.onboardingState.findFirst({ where: { userId } });
    if (!existing) return;
    const next = allowedPredecessors.includes(existing.state) ? target : existing.state;
    await this.prisma.onboardingState.update({
      where: { id: existing.id },
      data: { state: next as never, currentStep: 'assessment', updatedAt: now, lastActivityAt: now },
    });
  }

  private async contextFor(userId: string): Promise<OnboardingGuardContext> {
    const row = await this.prisma.onboardingState.findFirst({ where: { userId } });
    const consentGranted = await this.consent.hasGrantedCurrentConsent(userId);
    return {
      userId,
      onboardingState: row?.state ?? 'NOT_STARTED',
      emailVerified: true, // EmailVerifiedGuard enforced at the route
      consentGranted,
    };
  }
}