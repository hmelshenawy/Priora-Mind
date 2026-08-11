import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { COACHING_DISCLAIMER_V1 } from '../constants/coaching-disclaimer';
import { COACHING_LIBRARY_V1 } from '../constants/coaching-library';
import { NoCurrentPlanException, PlanNotReadyException, PlanUnavailableException } from '../constants/coaching.errors';
import { CoachingEligibilityService } from './coaching-eligibility.service';
import { CoachingGenerationService } from './coaching-generation.service';
import { toCoachingPlanResponse, toGenerationStatusResponse, toPlanUnavailableResponse } from '../dto/coaching-plan-mapping';

type Db = Record<string, { [method: string]: (...args: unknown[]) => unknown }>;
type TxDb = Db & { $transaction?: never };

@Injectable()
export class CoachingPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CoachingEligibilityService,
    private readonly generation: CoachingGenerationService,
  ) {}

  get db(): Db {
    return this.prisma as unknown as Db;
  }

  async startOrGet(userId: string) {
    const result = await this.eligibility.assertEligible(userId);
    let plan = await this.currentPlan(userId);
    if (!plan || plan.sourceResultId !== result.resultId) {
      plan = await this.createOrSupersedeCurrentPlan(userId, result);
    }
    await this.generation.reclaimIfStale(plan);
    plan = await this.currentPlan(userId) ?? plan;
    if (plan.generationStatus === 'FAILED') {
      await this.db.coachingPlan.update({ where: { id: plan.id }, data: { generationStatus: 'PENDING', planStatus: null } });
      plan = await this.currentPlan(userId) ?? plan;
    }
    if (plan.generationStatus === 'PENDING') await this.generation.start(plan, result);
    return this.mapPlan(plan);
  }

  async getCurrent(userId: string) {
    await this.eligibility.assertEligible(userId);
    const plan = await this.currentPlan(userId);
    if (!plan) throw new NoCurrentPlanException();
    await this.generation.reclaimIfStale(plan);
    return this.mapPlan((await this.currentPlan(userId)) ?? plan);
  }

  async acceptPlan(userId: string) {
    await this.eligibility.assertEligible(userId);
    const plan = await this.currentPlan(userId);
    if (!plan) throw new PlanNotReadyException();
    if (plan.generationStatus === 'FAILED') throw new PlanUnavailableException();
    if (plan.generationStatus !== 'READY') throw new PlanNotReadyException();
    if (plan.planStatus === 'PROPOSED') {
      await this.db.coachingPlan.update({ where: { id: plan.id }, data: { planStatus: 'ACTIVE', updatedAt: new Date() } });
    }
    const updated = await this.currentPlan(userId);
    return { plan_id: String(updated?.id ?? plan.id), planStatus: updated?.planStatus ?? 'ACTIVE' };
  }

  private async currentPlan(userId: string): Promise<Record<string, unknown> | null> {
    return await this.db.coachingPlan.findFirst({ where: { userId, isCurrent: true } }) as Record<string, unknown> | null;
  }

  private async createOrSupersedeCurrentPlan(userId: string, result: Awaited<ReturnType<CoachingEligibilityService['assertEligible']>>) {
    try {
      return await (this.db as Db & { $transaction: <T>(fn: (tx: TxDb) => Promise<T>) => Promise<T> }).$transaction(async (tx) => {
        const latest = await tx.coachingPlan.findFirst({ where: { userId, isCurrent: true } }) as Record<string, unknown> | null;
        if (latest?.sourceResultId === result.resultId) return latest;
        if (latest) await tx.coachingPlan.update({ where: { id: latest.id }, data: { isCurrent: false } });
        return await tx.coachingPlan.create({ data: this.newPlanData(userId, result) }) as Record<string, unknown>;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const current = await this.currentPlan(userId);
        if (current) return current;
        const sameSource = await this.db.coachingPlan.findUnique({ where: { userId_sourceResultId: { userId, sourceResultId: result.resultId } } }) as Record<string, unknown> | null;
        if (sameSource) return sameSource;
      }
      throw error;
    }
  }

  private newPlanData(userId: string, result: Awaited<ReturnType<CoachingEligibilityService['assertEligible']>>) {
    return {
      userId,
      sourceAssessmentId: result.assessmentId,
      sourceResultId: result.resultId,
      definitionVersion: result.definitionVersion,
      libraryVersion: COACHING_LIBRARY_V1.version,
      disclaimerVersion: COACHING_DISCLAIMER_V1.version,
      promptVersion: '1.0',
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
  }

  private async mapPlan(plan: Record<string, unknown>) {
    if (plan.generationStatus === 'FAILED') throw new PlanUnavailableException(toPlanUnavailableResponse(plan));
    if (plan.generationStatus !== 'READY') return toGenerationStatusResponse(plan);
    const planId = String(plan.id);
    return toCoachingPlanResponse(plan, {
      focusAreas: await this.db.focusArea.findMany({ where: { planId } }) as Record<string, unknown>[],
      goals: await this.db.goal.findMany({ where: { planId } }) as Record<string, unknown>[],
      actions: await this.db.actionStep.findMany({ where: { planId } }) as Record<string, unknown>[],
    });
  }
}
