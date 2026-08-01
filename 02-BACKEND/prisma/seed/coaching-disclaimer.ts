import type { PrismaClient } from '@prisma/client';
import { COACHING_DISCLAIMER_V1 } from '../../src/modules/coaching/coaching-disclaimer';

export async function seedCoachingDisclaimer(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.coachingDisclaimer.findUnique({
    where: { version: COACHING_DISCLAIMER_V1.version },
  });

  if (!existing) {
    await prisma.coachingDisclaimer.create({
      data: {
        version: COACHING_DISCLAIMER_V1.version,
        copyEn: COACHING_DISCLAIMER_V1.copy.en,
        copyAr: COACHING_DISCLAIMER_V1.copy.ar,
        integrity: COACHING_DISCLAIMER_V1.integrity,
      },
    });
    return;
  }

  if (
    existing.copyEn !== COACHING_DISCLAIMER_V1.copy.en ||
    existing.copyAr !== COACHING_DISCLAIMER_V1.copy.ar ||
    existing.integrity !== COACHING_DISCLAIMER_V1.integrity
  ) {
    throw new Error(`CoachingDisclaimer ${COACHING_DISCLAIMER_V1.version} integrity mismatch`);
  }
}
