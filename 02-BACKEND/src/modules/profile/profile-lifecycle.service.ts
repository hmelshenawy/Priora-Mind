import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsentService } from '../auth/auth.public';
import { OnboardingGuardService, type OnboardingGuardContext } from './onboarding.guard';

@Injectable()
export class ProfileLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly guard: OnboardingGuardService,
  ) {}

  async assertCanEnterAssessment(userId: string): Promise<void> {
    this.guard.assertCanEnter('assessment', await this.contextFor(userId));
  }

  async assertCanEnterSafetyHold(userId: string): Promise<void> {
    this.guard.assertCanEnter('safety_hold', await this.contextFor(userId));
  }

  async markAssessmentInProgress(userId: string, now: Date): Promise<void> {
    await this.transition(userId, ['ASSESSMENT_PENDING', 'ASSESSMENT_IN_PROGRESS'], 'ASSESSMENT_IN_PROGRESS', 'assessment', now);
  }

  async markAssessmentComplete(userId: string, now: Date): Promise<void> {
    await this.transition(userId, ['ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_SUBMITTED'], 'COMPLETED', 'assessment', now);
  }

  async placeOnSafetyHold(userId: string, now: Date): Promise<void> {
    await this.transition(userId, ['SAFETY_HOLD', 'ASSESSMENT_IN_PROGRESS'], 'SAFETY_HOLD', 'safety_hold', now, true);
  }

  async releaseSafetyHoldToAssessment(userId: string, now: Date): Promise<void> {
    await this.transition(userId, ['SAFETY_HOLD', 'ASSESSMENT_IN_PROGRESS'], 'ASSESSMENT_IN_PROGRESS', 'assessment', now, true);
  }

  async isOnSafetyHold(userId: string): Promise<boolean> {
    const row = await this.prisma.onboardingState.findFirst({ where: { userId } });
    return row?.state === 'SAFETY_HOLD';
  }

  async touchOnboardingActivity(userId: string, now: Date): Promise<void> {
    const existing = await this.prisma.onboardingState.findFirst({ where: { userId } });
    if (!existing) return;
    await this.prisma.onboardingState.update({
      where: { id: existing.id },
      data: { lastActivityAt: now, updatedAt: now },
    });
  }

  private async contextFor(userId: string): Promise<OnboardingGuardContext> {
    const row = await this.prisma.onboardingState.findFirst({ where: { userId } });
    return {
      userId,
      onboardingState: row?.state ?? 'NOT_STARTED',
      emailVerified: true,
      consentGranted: await this.consent.hasGrantedCurrentConsent(userId),
    };
  }

  private async transition(
    userId: string,
    allowedPredecessors: readonly string[],
    target: string,
    currentStep: 'assessment' | 'safety_hold',
    now: Date,
    skipWhenDisallowed = false,
  ): Promise<void> {
    const existing = await this.prisma.onboardingState.findFirst({ where: { userId } });
    if (!existing) return;
    const allowed = allowedPredecessors.includes(existing.state);
    if (!allowed && skipWhenDisallowed) return;
    const next = allowed ? target : existing.state;
    await this.prisma.onboardingState.update({
      where: { id: existing.id },
      data: { state: next as never, currentStep, updatedAt: now, lastActivityAt: now },
    });
  }
}
