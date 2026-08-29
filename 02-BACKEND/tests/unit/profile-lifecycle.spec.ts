import { describe, expect, it, vi } from 'vitest';
import { ProfileLifecycleService } from '../../src/modules/profile/profile.public';

function service(state: string | null) {
  const row = state ? { id: 'onboarding-1', state } : null;
  const prisma = {
    onboardingState: {
      findFirst: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { prisma, lifecycle: new ProfileLifecycleService(prisma as never, {} as never, {} as never) };
}

describe('ProfileLifecycleService', () => {
  it('owns the exact assessment completion transition and timestamps', async () => {
    const { prisma, lifecycle } = service('ASSESSMENT_IN_PROGRESS');
    const now = new Date('2026-08-10T00:00:00.000Z');

    await lifecycle.markAssessmentComplete('user-1', now);

    expect(prisma.onboardingState.update).toHaveBeenCalledWith({
      where: { id: 'onboarding-1' },
      data: { state: 'COMPLETED', currentStep: 'assessment', updatedAt: now, lastActivityAt: now },
    });
  });

  it('preserves the Safety no-op for an unrelated predecessor state', async () => {
    const { prisma, lifecycle } = service('COMPLETED');
    const now = new Date('2026-08-10T00:00:00.000Z');

    await lifecycle.placeOnSafetyHold('user-1', now);

    expect(prisma.onboardingState.update).not.toHaveBeenCalled();
  });
});
