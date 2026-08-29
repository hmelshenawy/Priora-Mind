import { describe, expect, it, vi } from 'vitest';
import { AssessmentResultService } from '../../../../src/modules/assessment/assessment.public';

describe('AssessmentResultService', () => {
  it('returns null when the user has no scored result', async () => {
    const prisma = {
      assessmentResult: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new AssessmentResultService(prisma as never);

    await expect(service.getScoredResult('user-1')).resolves.toBeNull();
    expect(prisma.assessmentResult.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('selects the latest result and returns the unchanged Assessment-owned view', async () => {
    const row = {
      id: 'result-2',
      assessmentId: 'assessment-1',
      definitionVersion: 'v1',
      domainScores: { stress: { score: 2 } },
      strongestDomain: 'stress',
      supportDomain: 'sleep',
      selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
      goalFreeText: { stress: { text: 'sleep better' } },
    };
    const prisma = {
      assessmentResult: { findFirst: vi.fn().mockResolvedValue(row) },
    };
    const service = new AssessmentResultService(prisma as never);

    await expect(service.getScoredResult('user-1')).resolves.toEqual({
      resultId: 'result-2',
      assessmentId: 'assessment-1',
      definitionVersion: 'v1',
      domainScores: { stress: { score: 2 } },
      strongestDomain: 'stress',
      supportDomain: 'sleep',
      selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
      goalFreeText: { stress: { text: 'sleep better' } },
    });
    expect(prisma.assessmentResult.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
