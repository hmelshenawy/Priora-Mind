import { describe, expect, it, vi } from 'vitest';
import { COACHING_LIBRARY_V1, coachingLibraryIntegrity } from '../../src/modules/coaching/coaching-library';
import { COACHING_DISCLAIMER_V1 } from '../../src/modules/coaching/coaching-disclaimer';
import { seedCoachingLibrary } from '../../prisma/seed/coaching-library';
import { seedCoachingDisclaimer } from '../../prisma/seed/coaching-disclaimer';

describe('development coaching fixtures', () => {
  it('contains small bilingual fixture content', () => {
    expect(COACHING_LIBRARY_V1.content.domains.length).toBeGreaterThan(0);
    expect(COACHING_LIBRARY_V1.content.domains.every((domain) =>
      domain.goals.every((goal) => goal.copy.en && goal.copy.ar
        && goal.actions.every((action) => action.copy.en && action.copy.ar)))).toBe(true);
    expect(COACHING_DISCLAIMER_V1.copy.en).not.toBe('');
    expect(COACHING_DISCLAIMER_V1.copy.ar).not.toBe('');
  });

  it('seeds version 1.0 idempotently when matching snapshots already exist', async () => {
    const prisma = {
      coachingActionLibrary: {
        findUnique: vi.fn().mockResolvedValue({
          content: COACHING_LIBRARY_V1.content,
          integrity: coachingLibraryIntegrity('1.0', COACHING_LIBRARY_V1.content),
        }),
        create: vi.fn(),
      },
      coachingDisclaimer: {
        findUnique: vi.fn().mockResolvedValue({
          copyEn: COACHING_DISCLAIMER_V1.copy.en,
          copyAr: COACHING_DISCLAIMER_V1.copy.ar,
          integrity: COACHING_DISCLAIMER_V1.integrity,
        }),
        create: vi.fn(),
      },
    };
    await seedCoachingLibrary(prisma as never);
    await seedCoachingDisclaimer(prisma as never);
    expect(prisma.coachingActionLibrary.create).not.toHaveBeenCalled();
    expect(prisma.coachingDisclaimer.create).not.toHaveBeenCalled();
  });
});
