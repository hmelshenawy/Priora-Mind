import type { Prisma, PrismaClient } from '@prisma/client';
import { COACHING_LIBRARY_V1, coachingLibraryIntegrity, type CoachingLibraryContent } from '../../src/modules/coaching/constants/coaching-library';

export async function seedCoachingLibrary(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.coachingActionLibrary.findUnique({
    where: { version: COACHING_LIBRARY_V1.version },
  });

  if (!existing) {
    await prisma.coachingActionLibrary.create({
      data: {
        version: COACHING_LIBRARY_V1.version,
        content: COACHING_LIBRARY_V1.content as unknown as Prisma.InputJsonValue,
        integrity: COACHING_LIBRARY_V1.integrity,
      },
    });
    return;
  }

  const storedIntegrity = coachingLibraryIntegrity(
    COACHING_LIBRARY_V1.version,
    existing.content as unknown as CoachingLibraryContent,
  );
  if (storedIntegrity !== COACHING_LIBRARY_V1.integrity || existing.integrity !== COACHING_LIBRARY_V1.integrity) {
    throw new Error(`CoachingActionLibrary ${COACHING_LIBRARY_V1.version} integrity mismatch`);
  }
}
