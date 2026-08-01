import type { PrismaClient } from '@prisma/client';
import { COACHING_LIBRARY_V1 } from '../../src/modules/coaching/coaching-library';

export async function seedCoachingLibrary(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.coachingActionLibrary.findUnique({
    where: { version: COACHING_LIBRARY_V1.version },
  });

  if (!existing) {
    await prisma.coachingActionLibrary.create({
      data: {
        version: COACHING_LIBRARY_V1.version,
        content: COACHING_LIBRARY_V1.content,
        integrity: COACHING_LIBRARY_V1.integrity,
      },
    });
    return;
  }

  const storedContent = JSON.stringify(existing.content);
  const expectedContent = JSON.stringify(COACHING_LIBRARY_V1.content);
  if (storedContent !== expectedContent || existing.integrity !== COACHING_LIBRARY_V1.integrity) {
    throw new Error(`CoachingActionLibrary ${COACHING_LIBRARY_V1.version} integrity mismatch`);
  }
}
