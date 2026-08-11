import { Injectable } from '@nestjs/common';
import { ConsentService } from '../../auth/consent.service';
import { AssessmentResultService } from '../../assessment/services/assessment-result.service';
import type { ScoredResultDto } from '../../assessment/dto/assessment.dto';
import { OnboardingGuardService, type OnboardingGuardContext } from '../../profile/onboarding.guard';
import { SafetyService } from '../../safety/safety.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResultNotFoundException } from '../../assessment/constants/assessment.errors';
import { NoCurrentPlanException, SafetyHoldException } from '../constants/coaching.errors';

type Db = Record<string, { [method: string]: (...args: unknown[]) => unknown }>;

@Injectable()
export class CoachingEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly guard: OnboardingGuardService,
    private readonly safety: SafetyService,
    private readonly results: AssessmentResultService,
  ) {}

  get db(): Db {
    return this.prisma as unknown as Db;
  }

  async assertEligible(userId: string): Promise<ScoredResultDto> {
    const ctx = await this.contextFor(userId);
    this.guard.assertCanEnter('dashboard', ctx);
    const level = await this.safety.currentLevel(userId);
    if (level && level !== 'NORMAL' && level !== 'DISTRESS') {
      const safetyRoute = await this.safety.currentRoute(userId);
      throw new SafetyHoldException(safetyRoute ? { safety_route: safetyRoute } : {});
    }
    const result = await this.results.getScoredResult(userId);
    if (!result) throw new ResultNotFoundException();
    return result;
  }

  async getCurrentResultOrNoPlan(userId: string): Promise<ScoredResultDto> {
    const result = await this.results.getScoredResult(userId);
    if (!result) throw new NoCurrentPlanException();
    return result;
  }

  private async contextFor(userId: string): Promise<OnboardingGuardContext> {
    const row = await this.db.onboardingState.findFirst({ where: { userId } }) as { state?: string } | null;
    return {
      userId,
      onboardingState: row?.state ?? 'NOT_STARTED',
      emailVerified: true,
      consentGranted: await this.consent.hasGrantedCurrentConsent(userId),
    };
  }
}
