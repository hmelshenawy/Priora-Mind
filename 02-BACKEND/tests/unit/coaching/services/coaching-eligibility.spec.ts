import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CoachingEligibilityService } from '../../../../src/modules/coaching/services/coaching-eligibility.service';
import { SafetyHoldException } from '../../../../src/modules/coaching/constants/coaching.errors';
import { ResultNotFoundException } from '../../../../src/modules/assessment/constants/assessment.errors';

const result = {
  resultId: 'result-1',
  assessmentId: 'assessment-1',
  definitionVersion: '1.0',
  domainScores: {},
  strongestDomain: 'stress',
  supportDomain: 'sleep',
  selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
  goalFreeText: null,
};

function service({ state = 'COMPLETED', safety = 'NORMAL', scored = result } = {}) {
  const prisma = { onboardingState: { findFirst: vi.fn().mockResolvedValue({ state }) } };
  const consent = { hasGrantedCurrentConsent: vi.fn().mockResolvedValue(true) };
  const guard = { assertCanEnter: vi.fn((route: string, ctx: { onboardingState: string }) => {
    if (route === 'dashboard' && ctx.onboardingState !== 'COMPLETED') throw new HttpException({ error: { code: 'ONBOARDING_STEP_BLOCKED' } }, 403);
  }) };
  const safetyService = { currentLevel: vi.fn().mockResolvedValue(safety), currentRoute: vi.fn().mockResolvedValue({ path: '/safety/hold' }) };
  const results = { getScoredResult: vi.fn().mockResolvedValue(scored) };
  return {
    eligibility: new CoachingEligibilityService(prisma as never, consent as never, guard as never, safetyService as never, results as never),
    guard,
    safetyService,
    results,
  };
}

describe('coaching eligibility rules', () => {
  it('allows completed users with a scored result and NORMAL or DISTRESS safety', async () => {
    await expect(service({ safety: 'NORMAL' }).eligibility.assertEligible('user-1')).resolves.toEqual(result);
    await expect(service({ safety: 'DISTRESS' }).eligibility.assertEligible('user-1')).resolves.toEqual(result);
  });

  it('blocks incomplete users before checking safety or generation result', async () => {
    const { eligibility, safetyService, results } = service({ state: 'ASSESSMENT_IN_PROGRESS' });
    await expect(eligibility.assertEligible('user-1')).rejects.toBeInstanceOf(HttpException);
    expect(safetyService.currentLevel).not.toHaveBeenCalled();
    expect(results.getScoredResult).not.toHaveBeenCalled();
  });

  it('excludes SAFETY_HOLD, HIGH_RISK, and CRISIS users before generation', async () => {
    await expect(service({ safety: 'SAFETY_HOLD' }).eligibility.assertEligible('user-1')).rejects.toBeInstanceOf(SafetyHoldException);
    await expect(service({ safety: 'HIGH_RISK' }).eligibility.assertEligible('user-1')).rejects.toBeInstanceOf(SafetyHoldException);
    await expect(service({ safety: 'CRISIS' }).eligibility.assertEligible('user-1')).rejects.toBeInstanceOf(SafetyHoldException);
  });

  it('returns RESULT_NOT_FOUND when no scored result exists', async () => {
    await expect(service({ scored: null }).eligibility.assertEligible('user-1')).rejects.toBeInstanceOf(ResultNotFoundException);
  });
});
