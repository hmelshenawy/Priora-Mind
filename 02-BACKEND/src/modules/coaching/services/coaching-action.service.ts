import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { recomputePlanStatus } from '../utils/coaching-lifecycle';
import { ActionConflictException, ActionResultNotFoundException, PlanNotActiveException, PlanNotReadyException } from '../constants/coaching.errors';
import { CoachingEligibilityService } from './coaching-eligibility.service';
import type { UpdateActionInput, UpdateActionResponse } from '../dto/coaching.dto';

type Db = Record<string, { [method: string]: (...args: unknown[]) => unknown }> & {
  $transaction: <T>(fn: (tx: Db) => Promise<T>) => Promise<T>;
};

type ActionRow = Record<string, unknown>;
type PlanRow = Record<string, unknown>;

@Injectable()
export class CoachingActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CoachingEligibilityService,
  ) {}

  get db(): Db {
    return this.prisma as unknown as Db;
  }

  async updateAction(userId: string, actionId: string, input: UpdateActionInput): Promise<UpdateActionResponse> {
    await this.eligibility.assertEligible(userId);
    return await this.db.$transaction(async (tx) => {
      const action = await tx.actionStep.findFirst({ where: { id: actionId, plan: { userId, isCurrent: true } } }) as ActionRow | null;
      if (!action) throw new ActionResultNotFoundException();
      const plan = await tx.coachingPlan.findFirst({ where: { id: String(action.planId), userId, isCurrent: true } }) as PlanRow | null;
      if (!plan) throw new ActionResultNotFoundException();
      this.assertMutable(plan);
      if (action.status === input.status) return await this.response(tx, action, plan);
      const where: Record<string, unknown> = { id: actionId, status: { in: [action.status] } };
      if (input.expected_version !== undefined) where.version = input.expected_version;
      const updated = await tx.actionStep.updateMany({ where, data: { status: input.status, version: { increment: 1 }, updatedAt: new Date() } }) as { count: number };
      const latest = await tx.actionStep.findFirst({ where: { id: actionId, plan: { userId, isCurrent: true } } }) as ActionRow | null;
      if (!latest) throw new ActionResultNotFoundException();
      if (updated.count === 0 && latest.status !== input.status) throw new ActionConflictException();
      return await this.response(tx, latest, plan);
    });
  }

  private assertMutable(plan: PlanRow): void {
    if (plan.generationStatus !== 'READY') throw new PlanNotReadyException();
    if (plan.planStatus !== 'ACTIVE' && plan.planStatus !== 'COMPLETED') throw new PlanNotActiveException();
  }

  private async response(tx: Db, action: ActionRow, plan: PlanRow): Promise<UpdateActionResponse> {
    const planId = String(plan.id);
    const total = await tx.actionStep.count({ where: { planId } }) as number;
    const incomplete = await tx.actionStep.count({ where: { planId, status: 'INCOMPLETE' } }) as number;
    const completed = total - incomplete;
    const planStatus = recomputePlanStatus(incomplete);
    await tx.coachingPlan.update({ where: { id: planId }, data: { planStatus, updatedAt: new Date() } });
    return {
      action: { id: String(action.id), status: action.status as never, version: Number(action.version ?? 1) },
      progress: { completed, total },
      plan_status: planStatus,
    };
  }
}
