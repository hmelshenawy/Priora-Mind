import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { FakeCoachingLlmAdapter } from '../../src/modules/ai/services/fake-coaching-llm.adapter';
import { CoachingActionService } from '../../src/modules/coaching/services/coaching-action.service';
import { CoachingController } from '../../src/modules/coaching/controllers/coaching.controller';
import { CoachingGenerationService } from '../../src/modules/coaching/services/coaching-generation.service';
import { CoachingPlanService } from '../../src/modules/coaching/services/coaching-plan.service';
import { ActionConflictException, PlanNotActiveException, PlanNotReadyException, SafetyHoldException } from '../../src/modules/coaching/constants/coaching.errors';
import type { ScoredResultDto } from '../../src/modules/assessment/dto/assessment.dto';
import type { GroundingBundle } from '../../src/modules/ai/ai.public';

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

const bundle: GroundingBundle = {
  assessment: {
    resultId: result1.resultId,
    assessmentId: result1.assessmentId,
    definitionVersion: result1.definitionVersion,
    domainScores: result1.domainScores,
    strongestDomain: result1.strongestDomain,
    supportDomain: result1.supportDomain,
    selectedPriorities: result1.selectedPriorities,
  },
  focusAreaEvidence: [{ domain: 'stress', source: 'priority' }],
  profile: {},
  libraryVersion: '1.0',
  library: {
    domains: [{
      domain: 'stress',
      focusAreaReasons: {},
      goals: [{ libraryKey: 'goal.stress', copy: { en: 'Goal', ar: 'هدف' }, actions: [{ libraryKey: 'action.stress', copy: { en: 'Action', ar: 'فعل' } }] }],
    }],
    pacingLabels: {},
    titleTemplates: [],
    summaryTemplates: [],
  },
  disclaimerVersion: '1.0',
  disclaimer: { en: 'Disclaimer', ar: 'تنبيه' },
  promptVersion: '1.0',
  instructions: [],
};

function setup(initialResult = result1) {
  const db = new InMemoryPrisma();
  const llm = new FakeCoachingLlmAdapter();
  const grounding = { assemble: vi.fn().mockResolvedValue(bundle) };
  const generation = new CoachingGenerationService(db as never, grounding as never, llm);
  const eligibility = { assertEligible: vi.fn().mockResolvedValue(initialResult) };
  const service = new CoachingPlanService(db as never, eligibility as never, generation);
  const actions = new CoachingActionService(db as never, eligibility as never);
  const controller = new CoachingController(service, actions);
  return { db, llm, grounding, generation, eligibility, controller };
}

async function start(controller: CoachingController) {
  const res = { status: vi.fn() };
  return { body: await controller.start({ user: { sub: 'user-1' } } as never, res as never), res };
}

async function get(controller: CoachingController) {
  const res = { status: vi.fn() };
  return { body: await controller.get({ user: { sub: 'user-1' } } as never, res as never), res };
}

describe('coaching plan Phase 3 e2e flow with fake dependencies', () => {
  it('runs eligible start, polling, bilingual retrieval, explicit acceptance, and locale-safe reload without a live provider', async () => {
    const { controller, generation, grounding, llm, db } = setup();
    const first = await start(controller);
    expect(first.res.status).toHaveBeenCalledWith(202);
    const planId = String(first.body.plan_id);
    const duplicate = await start(controller);
    expect(String(duplicate.body.plan_id)).toBe(planId);
    expect(llm.calls).toBe(1);
    const duringOrReady = await get(controller);
    if (duringOrReady.body.generationStatus !== 'READY') expect(duringOrReady.res.status).toHaveBeenCalledWith(202);
    await generation.waitForIdle(planId);

    const ready = await get(controller);
    expect(ready.body).toMatchObject({ generationStatus: 'READY', planStatus: 'PROPOSED', title: { en: expect.any(String), ar: expect.any(String) } });
    expect(ready.body.title.en).not.toBe(ready.body.title.ar);
    await expect(controller.accept({ user: { sub: 'user-1' } } as never)).resolves.toEqual({ plan_id: planId, planStatus: 'ACTIVE' });
    const active = await get(controller);
    expect(active.body).toMatchObject({ generationStatus: 'READY', planStatus: 'ACTIVE' });
    await get(controller);
    expect(llm.calls).toBe(1);
    expect(grounding.assemble).toHaveBeenCalledTimes(1);
    const metadata = JSON.stringify(db.coachingPlanGeneration.findMany({ where: { planId } }));
    expect(metadata).not.toContain('Generated Plan');
    expect(metadata).not.toContain('Generated Summary');
    expect(metadata).not.toContain('Action');
    expect(metadata.toLowerCase()).not.toContain('chain');
    expect(metadata.toLowerCase()).not.toContain('thought');
    expect(db.coachingPlan.count({ where: { userId: 'user-1', isCurrent: true } })).toBe(1);
  });

  it('supports retryable failure on the same plan and blocks duplicate retry provider calls', async () => {
    const { controller, db, generation, llm } = setup();
    const first = await start(controller);
    const planId = String(first.body.plan_id);
    await generation.waitForIdle(planId);
    db.coachingPlan.update({ where: { id: planId }, data: { generationStatus: 'FAILED', planStatus: null } });
    await Promise.all([start(controller), start(controller)]);
    await generation.waitForIdle(planId);
    expect(db.coachingPlan.count({ where: { userId: 'user-1' } })).toBe(1);
    expect(db.coachingPlanGeneration.findMany({ where: { planId } }).map((attempt) => attempt.attempt)).toEqual([1, 2]);
    expect(llm.calls).toBe(2);
  });

  it('blocks SAFETY_HOLD and isolates ownership by JWT user id', async () => {
    const safety = setup();
    safety.eligibility.assertEligible.mockRejectedValue(new SafetyHoldException());
    await expect(start(safety.controller)).rejects.toBeInstanceOf(SafetyHoldException);
    expect(safety.llm.calls).toBe(0);

    const other = setup();
    other.db.coachingPlan.create({ data: { userId: 'other-user', sourceAssessmentId: 'a', sourceResultId: 'r', definitionVersion: '1.0', libraryVersion: '1.0', disclaimerVersion: '1.0', promptVersion: '1.0' } });
    await expect(get(other.controller)).rejects.toThrow();
  });

  it('routes incomplete users before generation and re-checks SAFETY_HOLD on accept and PATCH', async () => {
    const incomplete = setup();
    incomplete.eligibility.assertEligible.mockRejectedValue(new HttpException({ error: { code: 'ONBOARDING_STEP_BLOCKED', next: 'assessment' } }, 403));
    await expect(start(incomplete.controller)).rejects.toBeInstanceOf(HttpException);
    expect(incomplete.llm.calls).toBe(0);
    expect(incomplete.db.coachingPlan.count({ where: { userId: 'user-1' } })).toBe(0);

    const safety = setup();
    const first = await start(safety.controller);
    const planId = String(first.body.plan_id);
    await safety.generation.waitForIdle(planId);
    await safety.controller.accept({ user: { sub: 'user-1' } } as never);
    const action = (await get(safety.controller)).body.actions[0];
    safety.eligibility.assertEligible.mockRejectedValue(new SafetyHoldException({ safety_route: { path: '/safety/hold' } }));

    await expect(safety.controller.accept({ user: { sub: 'user-1' } } as never)).rejects.toBeInstanceOf(SafetyHoldException);
    await expect(safety.controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE' })).rejects.toBeInstanceOf(SafetyHoldException);
  });

  it('supersedes the current plan for a retake and preserves the previous plan snapshot', async () => {
    const { controller, eligibility, generation, db } = setup(result1);
    const first = await start(controller);
    const firstId = String(first.body.plan_id);
    await generation.waitForIdle(firstId);
    await controller.accept({ user: { sub: 'user-1' } } as never);
    eligibility.assertEligible.mockResolvedValue(result2);
    const second = await start(controller);
    const secondId = String(second.body.plan_id);
    expect(secondId).not.toBe(firstId);
    expect(db.coachingPlanStore.get(firstId)).toMatchObject({ isCurrent: false, generationStatus: 'READY', planStatus: 'ACTIVE' });
    expect(db.coachingPlanStore.get(secondId)).toMatchObject({ isCurrent: true, sourceResultId: 'result-2' });
    expect(db.coachingPlan.count({ where: { userId: 'user-1', isCurrent: true } })).toBe(1);
  });

  it('tracks action progress after acceptance, persists it, completes all actions, and reopens to ACTIVE', async () => {
    const { controller, generation } = setup();
    const first = await start(controller);
    const planId = String(first.body.plan_id);
    await generation.waitForIdle(planId);
    await controller.accept({ user: { sub: 'user-1' } } as never);
    const active = await get(controller);
    const action = active.body.actions[0];
    const complete = await controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE', expected_version: action.version });
    expect(complete).toMatchObject({ action: { status: 'COMPLETE' }, progress: { completed: 1, total: 1 }, plan_status: 'COMPLETED' });
    const persisted = await get(controller);
    expect(persisted.body).toMatchObject({ planStatus: 'COMPLETED', progress: { completed: 1, total: 1 } });
    const reopened = await controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'INCOMPLETE', expected_version: complete.action.version });
    expect(reopened).toMatchObject({ action: { status: 'INCOMPLETE' }, progress: { completed: 0, total: 1 }, plan_status: 'ACTIVE' });
    expect((await get(controller)).body).toMatchObject({ planStatus: 'ACTIVE', progress: { completed: 0, total: 1 } });
  });

  it('converges concurrent action updates and enforces PATCH readiness/acceptance gates', async () => {
    const { controller, generation, db } = setup();
    const first = await start(controller);
    const planId = String(first.body.plan_id);
    await generation.waitForIdle(planId);
    const proposed = await get(controller);
    const action = proposed.body.actions[0];
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE' })).rejects.toBeInstanceOf(PlanNotActiveException);
    db.coachingPlan.update({ where: { id: planId }, data: { generationStatus: 'PENDING', planStatus: null } });
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE' })).rejects.toBeInstanceOf(PlanNotReadyException);
    db.coachingPlan.update({ where: { id: planId }, data: { generationStatus: 'READY', planStatus: 'ACTIVE' } });
    await controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'COMPLETE', expected_version: 1 });
    await expect(controller.updateAction({ user: { sub: 'user-1' } } as never, action.id, { status: 'INCOMPLETE', expected_version: 1 })).rejects.toBeInstanceOf(ActionConflictException);
  });

  it('keeps two users isolated for GET, accept, and action mutation', async () => {
    const first = setup();
    const firstPlan = await start(first.controller);
    const firstPlanId = String(firstPlan.body.plan_id);
    await first.generation.waitForIdle(firstPlanId);
    await first.controller.accept({ user: { sub: 'user-1' } } as never);
    const firstAction = (await get(first.controller)).body.actions[0];

    const secondStart = await first.controller.start({ user: { sub: 'user-2' } } as never, { status: vi.fn() } as never);
    const secondPlanId = String(secondStart.plan_id);
    await first.generation.waitForIdle(secondPlanId);

    const secondGet = await first.controller.get({ user: { sub: 'user-2' } } as never, { status: vi.fn() } as never);
    expect(secondGet.plan_id).toBe(secondPlanId);
    expect(secondGet.plan_id).not.toBe(firstPlanId);
    await expect(first.controller.updateAction({ user: { sub: 'user-2' } } as never, firstAction.id, { status: 'COMPLETE' })).rejects.toThrow();
    expect(first.db.actionStepStore.get(firstAction.id)!.status).toBe('INCOMPLETE');
  });

  it('returns an existing plan for a returning completed user without restarting generation', async () => {
    const { controller, generation, llm } = setup();
    const first = await start(controller);
    const planId = String(first.body.plan_id);
    await generation.waitForIdle(planId);
    await controller.accept({ user: { sub: 'user-1' } } as never);
    const before = llm.calls;

    const returning = await get(controller);
    expect(returning.body).toMatchObject({ plan_id: planId, generationStatus: 'READY', planStatus: 'ACTIVE' });
    expect(llm.calls).toBe(before);
  });
});
