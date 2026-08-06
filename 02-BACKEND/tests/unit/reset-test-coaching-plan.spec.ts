import { describe, expect, it, vi } from 'vitest';
import { parseSelector, resetCurrentCoachingPlan } from '../../scripts/reset-test-coaching-plan';

describe('reset test coaching plan utility', () => {
  it('requires exactly one user selector', () => {
    expect(parseSelector(['--email', 'test@example.com'])).toEqual({ email: 'test@example.com' });
    expect(parseSelector(['--user-id', 'user-1'])).toEqual({ userId: 'user-1' });
    expect(() => parseSelector([])).toThrow(/exactly one/);
    expect(() => parseSelector(['--email', 'test@example.com', '--user-id', 'user-1'])).toThrow(/only one/);
  });

  it('deletes only plan-owned records in dependency order and preserves protected counts', async () => {
    const order: string[] = [];
    const tx = {
      coachingPlan: {
        deleteMany: vi.fn().mockImplementation(async () => { order.push('CoachingPlan'); return { count: 1 }; }),
      },
      actionStep: { deleteMany: vi.fn().mockImplementation(async () => { order.push('ActionStep'); return { count: 4 }; }) },
      goal: { deleteMany: vi.fn().mockImplementation(async () => { order.push('Goal'); return { count: 2 }; }) },
      focusArea: { deleteMany: vi.fn().mockImplementation(async () => { order.push('FocusArea'); return { count: 1 }; }) },
      coachingPlanGeneration: { deleteMany: vi.fn().mockImplementation(async () => { order.push('CoachingPlanGeneration'); return { count: 2 }; }) },
    };
    const prisma = {
      userAccount: { findMany: vi.fn().mockResolvedValue([{ id: 'user-1' }]) },
      coachingPlan: {
        findMany: vi.fn().mockResolvedValue([{ id: 'plan-1' }]),
        count: vi.fn().mockResolvedValue(0),
      },
      assessmentResult: { count: vi.fn().mockResolvedValue(2) },
      conversation: { count: vi.fn().mockResolvedValue(3) },
      $transaction: vi.fn(async (fn) => fn(tx)),
    };

    const result = await resetCurrentCoachingPlan(prisma as never, { userId: 'user-1' });

    expect(order).toEqual(['ActionStep', 'Goal', 'FocusArea', 'CoachingPlanGeneration', 'CoachingPlan']);
    expect(result).toEqual({
      userId: 'user-1',
      planId: 'plan-1',
      removed: { actionSteps: 4, goals: 2, focusAreas: 1, generations: 2, plans: 1 },
      preserved: { assessmentResults: 2, conversations: 3 },
    });
    expect(prisma.assessmentResult.count).toHaveBeenCalledTimes(2);
    expect(prisma.conversation.count).toHaveBeenCalledTimes(2);
    expect(prisma.coachingPlan.count).toHaveBeenCalledWith({
      where: { id: 'plan-1', userId: 'user-1', isCurrent: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 20_000,
    });
    expect('assessmentResult' in tx).toBe(false);
    expect('conversation' in tx).toBe(false);
  });

  it.each([
    ['missing user', [], [{ id: 'plan-1' }], /user was not found/],
    ['no current plan', [{ id: 'user-1' }], [], /No current coaching plan/],
    ['multiple current plans', [{ id: 'user-1' }], [{ id: 'plan-1' }, { id: 'plan-2' }], /More than one current/],
  ])('fails safely for %s', async (_name, users, plans, message) => {
    const prisma = {
      userAccount: { findMany: vi.fn().mockResolvedValue(users) },
      coachingPlan: { findMany: vi.fn().mockResolvedValue(plans) },
      $transaction: vi.fn(),
    };
    await expect(resetCurrentCoachingPlan(prisma as never, { userId: 'user-1' })).rejects.toThrow(message as RegExp);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports changed protected counts after commit', async () => {
    const tx = {
      actionStep: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      goal: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      focusArea: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      coachingPlanGeneration: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      coachingPlan: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      userAccount: { findMany: vi.fn().mockResolvedValue([{ id: 'user-1' }]) },
      coachingPlan: { findMany: vi.fn().mockResolvedValue([{ id: 'plan-1' }]), count: vi.fn().mockResolvedValue(0) },
      assessmentResult: { count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0) },
      conversation: { count: vi.fn().mockResolvedValue(2) },
      $transaction: vi.fn(async (fn) => fn(tx)),
    };
    await expect(resetCurrentCoachingPlan(prisma as never, { userId: 'user-1' })).rejects.toThrow(/counts changed/);
  });

  it('requires the targeted current plan to be absent after commit', async () => {
    const tx = {
      actionStep: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      goal: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      focusArea: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      coachingPlanGeneration: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      coachingPlan: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      userAccount: { findMany: vi.fn().mockResolvedValue([{ id: 'user-1' }]) },
      coachingPlan: { findMany: vi.fn().mockResolvedValue([{ id: 'plan-1' }]), count: vi.fn().mockResolvedValue(1) },
      assessmentResult: { count: vi.fn().mockResolvedValue(1) },
      conversation: { count: vi.fn().mockResolvedValue(2) },
      $transaction: vi.fn(async (fn) => fn(tx)),
    };
    await expect(resetCurrentCoachingPlan(prisma as never, { userId: 'user-1' })).rejects.toThrow(/still exists/);
  });
});
