import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { CoachingController } from '../../src/modules/coaching/coaching.controller';
import { CoachingPlanService } from '../../src/modules/coaching/coaching-plan.service';
import { NoCurrentPlanException, PlanNotReadyException, PlanUnavailableException } from '../../src/modules/coaching/coaching.errors';
import { EmailVerifiedGuard } from '../../src/modules/auth/guards/email-verified.guard';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import type { ScoredResultDto } from '../../src/modules/assessment/assessment.dto';

const result1: ScoredResultDto = {
  resultId: 'result-1',
  assessmentId: 'assessment-1',
  definitionVersion: '1.0',
  domainScores: { stress: { score: 7 } },
  strongestDomain: 'stress',
  supportDomain: 'sleep',
  selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
  goalFreeText: null,
};

const result2: ScoredResultDto = { ...result1, resultId: 'result-2', assessmentId: 'assessment-2' };

function setup(initialResult = result1) {
  const db = new InMemoryPrisma();
  const eligibility = { assertEligible: vi.fn().mockResolvedValue(initialResult) };
  const generation = { start: vi.fn(), reclaimIfStale: vi.fn() };
  const service = new CoachingPlanService(db as never, eligibility as never, generation as never);
  const controller = new CoachingController(service);
  return { db, eligibility, generation, service, controller };
}

async function callStart(controller: CoachingController) {
  const res = { status: vi.fn() };
  const body = await controller.start({ user: { sub: 'user-1' } } as never, res as never);
  return { body, res };
}

async function callGet(controller: CoachingController) {
  const res = { status: vi.fn() };
  const body = await controller.get({ user: { sub: 'user-1' } } as never, res as never);
  return { body, res };
}

function publishReady(db: InMemoryPrisma, planId: string, status: 'PROPOSED' | 'ACTIVE' | 'COMPLETED' = 'PROPOSED') {
  const focus = db.focusArea.create({ data: { planId, domain: 'stress', source: 'priority', position: 1, reason: { en: 'Reason', ar: 'سبب' } } });
  const goal = db.goal.create({ data: { planId, focusAreaId: focus.id, position: 1, copy: { en: 'Goal', ar: 'هدف' }, libraryKey: 'goal.stress' } });
  db.actionStep.create({ data: { planId, focusAreaId: focus.id, goalId: goal.id, position: 1, copy: { en: 'Action', ar: 'فعل' }, libraryKey: 'action.stress' } });
  db.coachingPlan.update({ where: { id: planId }, data: { generationStatus: 'READY', planStatus: status, title: { en: 'Plan', ar: 'خطة' }, summary: { en: 'Summary', ar: 'ملخص' }, disclaimer: { en: 'Disclaimer', ar: 'تنبيه' } } });
}

function errorPayload(error: unknown) {
  return error instanceof HttpException ? error.getResponse() as { error?: Record<string, unknown> } : {};
}

describe('coaching controller contract', () => {
  it('is protected by JWT and email verification guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CoachingController)).toEqual([JwtAuthGuard, EmailVerifiedGuard]);
  });

  it('POST creates one current pending plan and returns 202 without exposing plan content', async () => {
    const { db, controller, generation } = setup();
    const { body, res } = await callStart(controller);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(body).toMatchObject({ generationStatus: 'PENDING' });
    expect('title' in body).toBe(false);
    expect(generation.start).toHaveBeenCalledTimes(1);
    expect(db.coachingPlan.count({ where: { userId: 'user-1', isCurrent: true } })).toBe(1);
  });

  it('POST returns 202 for existing PENDING and GENERATING plans without duplicate generation calls', async () => {
    const { db, controller, generation } = setup();
    const first = await callStart(controller);
    expect(first.res.status).toHaveBeenCalledWith(202);
    const second = await callStart(controller);
    expect(second.body).toEqual(first.body);
    db.coachingPlan.update({ where: { id: String(first.body.plan_id) }, data: { generationStatus: 'GENERATING' } });
    const third = await callStart(controller);
    expect(third.res.status).toHaveBeenCalledWith(202);
    expect(third.body).toEqual({ plan_id: first.body.plan_id, generationStatus: 'GENERATING' });
    expect(generation.start).toHaveBeenCalledTimes(2);
  });

  it('POST returns existing READY resource without invoking generation/provider again', async () => {
    const { db, controller, generation } = setup();
    const started = await callStart(controller);
    publishReady(db, String(started.body.plan_id));
    generation.start.mockClear();
    const ready = await callStart(controller);
    expect(ready.res.status).not.toHaveBeenCalledWith(202);
    expect(ready.body).toMatchObject({ generationStatus: 'READY', planStatus: 'PROPOSED' });
    expect(generation.start).not.toHaveBeenCalled();
  });

  it('GET without a current plan returns stable startable PLAN_NOT_FOUND', async () => {
    const { controller } = setup();
    await expect(callGet(controller)).rejects.toBeInstanceOf(NoCurrentPlanException);
    await callGet(controller).catch((error) => {
      expect(errorPayload(error).error).toMatchObject({ code: 'PLAN_NOT_FOUND', startable: true });
    });
  });

  it('GET returns 202 for PENDING and GENERATING representations', async () => {
    const { db, controller } = setup();
    const started = await callStart(controller);
    expect((await callGet(controller)).res.status).toHaveBeenCalledWith(202);
    db.coachingPlan.update({ where: { id: String(started.body.plan_id) }, data: { generationStatus: 'GENERATING' } });
    const generating = await callGet(controller);
    expect(generating.body).toEqual({ plan_id: started.body.plan_id, generationStatus: 'GENERATING' });
    expect(generating.res.status).toHaveBeenCalledWith(202);
  });

  it('GET returns READY/PROPOSED only after graph publication and accept changes only planStatus', async () => {
    const { db, controller } = setup();
    const started = await callStart(controller);
    const planId = String(started.body.plan_id);
    publishReady(db, planId);

    const ready = await callGet(controller);
    expect(ready.res.status).not.toHaveBeenCalledWith(202);
    expect(ready.body).toMatchObject({ generationStatus: 'READY', planStatus: 'PROPOSED', progress: { completed: 0, total: 1 } });

    await expect(controller.accept({ user: { sub: 'user-1' } } as never)).resolves.toEqual({ plan_id: planId, planStatus: 'ACTIVE' });
    expect(db.coachingPlanStore.get(planId)!.generationStatus).toBe('READY');
    await expect(controller.accept({ user: { sub: 'user-1' } } as never)).resolves.toEqual({ plan_id: planId, planStatus: 'ACTIVE' });
    db.coachingPlan.update({ where: { id: planId }, data: { planStatus: 'COMPLETED' } });
    await expect(controller.accept({ user: { sub: 'user-1' } } as never)).resolves.toEqual({ plan_id: planId, planStatus: 'COMPLETED' });
  });

  it('rejects accept until READY/PROPOSED and distinguishes FAILED as unavailable', async () => {
    const { db, controller } = setup();
    const started = await callStart(controller);
    const planId = String(started.body.plan_id);
    await expect(controller.accept({ user: { sub: 'user-1' } } as never)).rejects.toBeInstanceOf(PlanNotReadyException);
    db.coachingPlan.update({ where: { id: planId }, data: { generationStatus: 'FAILED', planStatus: null } });
    await expect(controller.accept({ user: { sub: 'user-1' } } as never)).rejects.toBeInstanceOf(PlanUnavailableException);
  });

  it('GET failed returns stable PLAN_UNAVAILABLE and POST retry reuses the same plan with a new attempt path', async () => {
    const { db, controller, generation } = setup();
    const started = await callStart(controller);
    const planId = String(started.body.plan_id);
    db.coachingPlan.update({ where: { id: planId }, data: { generationStatus: 'FAILED', planStatus: null } });
    await callGet(controller).catch((error) => {
      expect(error).toBeInstanceOf(PlanUnavailableException);
      expect(errorPayload(error).error).toMatchObject({ code: 'PLAN_UNAVAILABLE', plan_id: planId, generationStatus: 'FAILED', retryable: true });
    });
    const retry = await callStart(controller);
    expect(retry.body).toEqual({ plan_id: planId, generationStatus: 'PENDING' });
    expect(db.coachingPlan.count({ where: { userId: 'user-1' } })).toBe(1);
    expect(generation.start).toHaveBeenCalledTimes(2);
  });

  it('assessment retake supersedes the previous current plan transactionally', async () => {
    const { db, controller, eligibility } = setup(result1);
    const first = await callStart(controller);
    const firstId = String(first.body.plan_id);
    publishReady(db, firstId, 'ACTIVE');
    eligibility.assertEligible.mockResolvedValue(result2);

    const second = await callStart(controller);
    const secondId = String(second.body.plan_id);
    expect(secondId).not.toBe(firstId);
    expect(db.coachingPlanStore.get(firstId)!.isCurrent).toBe(false);
    expect(db.coachingPlanStore.get(firstId)!.generationStatus).toBe('READY');
    expect(db.coachingPlanStore.get(firstId)!.planStatus).toBe('ACTIVE');
    expect(db.coachingPlanStore.get(secondId)!.isCurrent).toBe(true);
    expect(db.coachingPlanStore.get(secondId)!.generationStatus).toBe('PENDING');
    expect(db.coachingPlan.count({ where: { userId: 'user-1', isCurrent: true } })).toBe(1);
  });

  it('concurrent starts do not create two current plans', async () => {
    const { db, controller } = setup();
    await Promise.all([callStart(controller), callStart(controller)]);
    expect(db.coachingPlan.count({ where: { userId: 'user-1', isCurrent: true } })).toBe(1);
  });

  it('enforces ownership through JWT user id on the service/controller path', async () => {
    const { db, controller } = setup();
    db.coachingPlan.create({ data: { userId: 'other-user', sourceAssessmentId: 'a', sourceResultId: 'r', definitionVersion: '1.0', libraryVersion: '1.0', disclaimerVersion: '1.0', promptVersion: '1.0' } });
    await expect(controller.get({ user: { sub: 'user-1' } } as never, { status: vi.fn() } as never)).rejects.toBeInstanceOf(HttpException);
  });
});
