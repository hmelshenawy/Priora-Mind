import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { CoachingController } from '../../src/modules/coaching/controllers/coaching.controller';
import { CoachingActionService } from '../../src/modules/coaching/services/coaching-action.service';
import { CoachingPlanService } from '../../src/modules/coaching/services/coaching-plan.service';
import { ActionConflictException, ActionResultNotFoundException, NoCurrentPlanException, PlanNotActiveException, PlanNotReadyException, PlanUnavailableException, SafetyHoldException } from '../../src/modules/coaching/constants/coaching.errors';
import { EmailVerifiedGuard } from '../../src/modules/auth/guards/email-verified.guard';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { ResultNotFoundException } from '../../src/modules/assessment/constants/assessment.errors';
import type { ScoredResultDto } from '../../src/modules/assessment/dto/assessment.dto';

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
  const actions = new CoachingActionService(db as never, eligibility as never);
  const controller = new CoachingController(service, actions);
  return { db, eligibility, generation, service, actions, controller };
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

  it('blocks incomplete onboarding, SAFETY_HOLD, and missing scored results before generation', async () => {
    const incomplete = setup();
    incomplete.eligibility.assertEligible.mockRejectedValue(new HttpException({ error: { code: 'ONBOARDING_STEP_BLOCKED', next: '/assessment' } }, 403));
    await expect(callStart(incomplete.controller)).rejects.toBeInstanceOf(HttpException);
    expect(incomplete.generation.start).not.toHaveBeenCalled();
    expect(incomplete.db.coachingPlan.count({ where: { userId: 'user-1' } })).toBe(0);

    const safety = setup();
    safety.eligibility.assertEligible.mockRejectedValue(new SafetyHoldException({ safety_route: { path: '/safety/hold' } }));
    await expect(callStart(safety.controller)).rejects.toBeInstanceOf(SafetyHoldException);
    expect(safety.generation.start).not.toHaveBeenCalled();
    expect(safety.db.coachingPlan.count({ where: { userId: 'user-1' } })).toBe(0);

    const missing = setup();
    missing.eligibility.assertEligible.mockRejectedValue(new ResultNotFoundException());
    await expect(callStart(missing.controller)).rejects.toBeInstanceOf(ResultNotFoundException);
    expect(missing.generation.start).not.toHaveBeenCalled();
    expect(missing.db.coachingPlan.count({ where: { userId: 'user-1' } })).toBe(0);
  });

  it('SAFETY_HOLD blocks accept and PATCH on an existing ready plan', async () => {
    const { db, controller, eligibility } = setup();
    const started = await callStart(controller);
    const planId = String(started.body.plan_id);
    publishReady(db, planId, 'ACTIVE');
    const action = db.actionStep.findMany({ where: { planId } })[0];
    eligibility.assertEligible.mockRejectedValue(new SafetyHoldException({ safety_route: { path: '/safety/hold' } }));

    await expect(controller.accept({ user: { sub: 'user-1' } } as never)).rejects.toBeInstanceOf(SafetyHoldException);
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE' })).rejects.toBeInstanceOf(SafetyHoldException);
    expect(db.coachingPlanStore.get(planId)).toMatchObject({ generationStatus: 'READY', planStatus: 'ACTIVE' });
  });

  it('enforces ownership through JWT user id on the service/controller path', async () => {
    const { db, controller } = setup();
    db.coachingPlan.create({ data: { userId: 'other-user', sourceAssessmentId: 'a', sourceResultId: 'r', definitionVersion: '1.0', libraryVersion: '1.0', disclaimerVersion: '1.0', promptVersion: '1.0' } });
    await expect(controller.get({ user: { sub: 'user-1' } } as never, { status: vi.fn() } as never)).rejects.toBeInstanceOf(HttpException);
  });

  it('GET is scoped to the caller current plan and client ownership fields are ignored', async () => {
    const { db, controller } = setup();
    const own = await callStart(controller);
    const ownId = String(own.body.plan_id);
    publishReady(db, ownId, 'ACTIVE');
    const foreign = db.coachingPlan.create({ data: { userId: 'other-user', sourceAssessmentId: 'foreign-a', sourceResultId: 'foreign-r', definitionVersion: '1.0', libraryVersion: '1.0', disclaimerVersion: '1.0', promptVersion: '1.0', generationStatus: 'READY', planStatus: 'ACTIVE', title: { en: 'Foreign', ar: 'أجنبي' }, summary: { en: 'Foreign', ar: 'أجنبي' }, disclaimer: { en: 'Foreign', ar: 'أجنبي' } } });

    const got = await callGet(controller);
    expect(got.body.plan_id).toBe(ownId);
    expect(got.body.plan_id).not.toBe(foreign.id);
    await expect(controller.start({ user: { sub: 'user-1' }, body: { userId: 'other-user', plan_id: foreign.id } } as never, { status: vi.fn() } as never)).resolves.toMatchObject({ plan_id: ownId });
  });

  it('PATCH rejects non-ready and proposed plans with stable conflict codes', async () => {
    const { db, controller } = setup();
    const started = await callStart(controller);
    const planId = String(started.body.plan_id);
    const focus = db.focusArea.create({ data: { planId, domain: 'stress', source: 'priority', position: 1, reason: { en: 'Reason', ar: 'سبب' } } });
    const action = db.actionStep.create({ data: { planId, focusAreaId: focus.id, goalId: null, position: 1, copy: { en: 'Action', ar: 'فعل' }, libraryKey: 'action.stress' } });
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE' })).rejects.toBeInstanceOf(PlanNotReadyException);
    publishReady(db, planId, 'PROPOSED');
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE' })).rejects.toBeInstanceOf(PlanNotActiveException);
    db.coachingPlan.update({ where: { id: planId }, data: { generationStatus: 'FAILED', planStatus: null } });
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE' })).rejects.toBeInstanceOf(PlanNotReadyException);
  });

  it('PATCH updates action status, progress, and planStatus without touching generationStatus', async () => {
    const { db, controller } = setup();
    const started = await callStart(controller);
    const planId = String(started.body.plan_id);
    publishReady(db, planId, 'ACTIVE');
    const actions = db.actionStep.findMany({ where: { planId } });
    const result = await controller.updateAction({ user: { sub: 'user-1' } } as never, actions[0].id, { status: 'COMPLETE', expected_version: 1 });
    expect(result).toMatchObject({ action: { id: actions[0].id, status: 'COMPLETE', version: 2 }, progress: { completed: 1, total: 1 }, plan_status: 'COMPLETED' });
    expect(db.coachingPlanStore.get(planId)).toMatchObject({ generationStatus: 'READY', planStatus: 'COMPLETED' });
    const reopen = await controller.updateAction({ user: { sub: 'user-1' } } as never, actions[0].id, { status: 'INCOMPLETE', expected_version: 2 });
    expect(reopen).toMatchObject({ action: { status: 'INCOMPLETE', version: 3 }, progress: { completed: 0, total: 1 }, plan_status: 'ACTIVE' });
    expect(db.coachingPlanStore.get(planId)!.generationStatus).toBe('READY');
  });

  it('PATCH is idempotent for same-status updates and detects stale expected_version conflicts', async () => {
    const { db, controller } = setup();
    const started = await callStart(controller);
    const planId = String(started.body.plan_id);
    publishReady(db, planId, 'ACTIVE');
    const action = db.actionStep.findMany({ where: { planId } })[0];
    const same = await controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'INCOMPLETE', expected_version: 1 });
    expect(same.action.version).toBe(1);
    await controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE', expected_version: 1 });
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'INCOMPLETE', expected_version: 1 })).rejects.toBeInstanceOf(ActionConflictException);
  });

  it('PATCH returns ACTION_NOT_FOUND for unknown or cross-user action ids', async () => {
    const { db, controller } = setup();
    const otherPlan = db.coachingPlan.create({ data: { userId: 'other-user', sourceAssessmentId: 'a', sourceResultId: 'r', definitionVersion: '1.0', libraryVersion: '1.0', disclaimerVersion: '1.0', promptVersion: '1.0', generationStatus: 'READY', planStatus: 'ACTIVE' } });
    const focus = db.focusArea.create({ data: { planId: otherPlan.id, domain: 'stress', source: 'priority', position: 1, reason: { en: 'Reason', ar: 'سبب' } } });
    const foreign = db.actionStep.create({ data: { planId: otherPlan.id, focusAreaId: focus.id, goalId: null, position: 1, copy: { en: 'Action', ar: 'فعل' }, libraryKey: 'action.other' } });
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, foreign.id, { status: 'COMPLETE' })).rejects.toBeInstanceOf(ActionResultNotFoundException);
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, 'missing-action', { status: 'COMPLETE' })).rejects.toBeInstanceOf(ActionResultNotFoundException);
  });
});
