import { describe, expect, it, vi } from 'vitest';
import { AssessmentSafetyLifecycleService } from '../../../../src/modules/assessment/assessment.public';

describe('AssessmentSafetyLifecycleService', () => {
  it('conditionally suspends only an active/not-started Assessment with the supplied timestamp', async () => {
    const prisma = { assessment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const service = new AssessmentSafetyLifecycleService(prisma as never);
    const now = new Date('2026-08-10T00:00:00.000Z');

    await service.suspendForSafety('assessment-1', now);

    expect(prisma.assessment.updateMany).toHaveBeenCalledWith({
      where: { id: 'assessment-1', state: { in: ['IN_PROGRESS', 'NOT_STARTED'] } },
      data: { state: 'SUSPENDED', lastActivityAt: now },
    });
  });

  it('resumes only a suspended current Assessment and is a no-op for stale state', async () => {
    const prisma = {
      assessment: {
        findFirst: vi.fn().mockResolvedValueOnce({ id: 'assessment-1', state: 'SUSPENDED' }).mockResolvedValueOnce({ id: 'assessment-1', state: 'SCORED' }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const service = new AssessmentSafetyLifecycleService(prisma as never);
    const now = new Date('2026-08-10T00:00:00.000Z');

    await service.resumeAfterSafety('user-1', now);
    await service.resumeAfterSafety('user-1', now);

    expect(prisma.assessment.update).toHaveBeenCalledTimes(1);
    expect(prisma.assessment.update).toHaveBeenCalledWith({
      where: { id: 'assessment-1' },
      data: { state: 'IN_PROGRESS', lastActivityAt: now },
    });
  });
});
