import { PrismaClient } from '@prisma/client';
import { seedCoachingDisclaimer } from './seed/coaching-disclaimer';
import { seedCoachingLibrary } from './seed/coaching-library';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedCoachingLibrary(prisma);
  await seedCoachingDisclaimer(prisma);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
