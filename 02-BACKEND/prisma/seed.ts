import { PrismaClient } from '@prisma/client';
import { seedCoachingDisclaimer } from './seed/coaching-disclaimer';
import { seedCoachingLibrary } from './seed/coaching-library';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development coaching fixtures must not be seeded in production');
  }
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
