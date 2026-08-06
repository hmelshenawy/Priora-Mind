import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

type UserSelector = { email: string } | { userId: string };

export type ResetCounts = {
  actionSteps: number;
  goals: number;
  focusAreas: number;
  generations: number;
  plans: number;
};

export type ResetResult = {
  userId: string;
  planId: string;
  removed: ResetCounts;
  preserved: { assessmentResults: number; conversations: number };
};

function requiredValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export function parseSelector(args: string[]): UserSelector {
  const email = requiredValue(args, '--email');
  const userId = requiredValue(args, '--user-id');
  if (email === undefined && userId === undefined) {
    throw new Error('Provide exactly one required selector: --email <email> or --user-id <id>');
  }
  if (email !== undefined && userId !== undefined) {
    throw new Error('Use only one selector: --email or --user-id');
  }
  return email !== undefined ? { email } : { userId: userId as string };
}

async function resolveUser(prisma: PrismaClient, selector: UserSelector) {
  const users = await prisma.userAccount.findMany({
    where: 'email' in selector
      ? { email: selector.email, deletedAt: null }
      : { id: selector.userId, deletedAt: null },
    select: { id: true },
    take: 2,
  });
  if (users.length === 0) throw new Error('Test user was not found');
  if (users.length > 1) throw new Error('Selector unexpectedly matched more than one test user');
  return users[0];
}

export async function resetCurrentCoachingPlan(
  prisma: PrismaClient,
  selector: UserSelector,
): Promise<ResetResult> {
  const user = await resolveUser(prisma, selector);
  const plans = await prisma.coachingPlan.findMany({
    where: { userId: user.id, isCurrent: true },
    select: { id: true },
    take: 2,
  });
  if (plans.length === 0) throw new Error('No current coaching plan exists for the test user');
  if (plans.length > 1) throw new Error('More than one current coaching plan exists for the test user');

  const planId = plans[0].id;
  const preservedBefore = {
    assessmentResults: await prisma.assessmentResult.count({ where: { userId: user.id } }),
    conversations: await prisma.conversation.count({ where: { userId: user.id } }),
  };

  const removed = await prisma.$transaction(async (tx) => {
    // Explicit child-first order makes the maintenance operation and its counts auditable.
    const actionSteps = await tx.actionStep.deleteMany({ where: { planId } });
    const goals = await tx.goal.deleteMany({ where: { planId } });
    const focusAreas = await tx.focusArea.deleteMany({ where: { planId } });
    const generations = await tx.coachingPlanGeneration.deleteMany({ where: { planId } });
    const deletedPlans = await tx.coachingPlan.deleteMany({ where: { id: planId, userId: user.id, isCurrent: true } });
    if (deletedPlans.count !== 1) throw new Error('Current coaching plan changed during reset; transaction rolled back');

    return {
      actionSteps: actionSteps.count,
      goals: goals.count,
      focusAreas: focusAreas.count,
      generations: generations.count,
      plans: deletedPlans.count,
    };
  }, { maxWait: 10_000, timeout: 20_000 });

  const preservedAfter = {
    assessmentResults: await prisma.assessmentResult.count({ where: { userId: user.id } }),
    conversations: await prisma.conversation.count({ where: { userId: user.id } }),
  };
  if (
    preservedAfter.assessmentResults !== preservedBefore.assessmentResults
    || preservedAfter.conversations !== preservedBefore.conversations
  ) {
    throw new Error('Reset committed, but protected assessment or conversation counts changed unexpectedly');
  }

  const remainingCurrentPlan = await prisma.coachingPlan.count({
    where: { id: planId, userId: user.id, isCurrent: true },
  });
  if (remainingCurrentPlan !== 0) {
    throw new Error('Reset committed, but the targeted current coaching plan still exists');
  }

  return { userId: user.id, planId, removed, preserved: preservedAfter };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('This development/testing utility is disabled when NODE_ENV=production');
  }
  const selector = parseSelector(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const result = await resetCurrentCoachingPlan(prisma, selector);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Coaching plan reset failed');
    process.exitCode = 1;
  });
}
