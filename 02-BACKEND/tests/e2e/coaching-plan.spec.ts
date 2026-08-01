import { describe, expect, it, vi } from 'vitest';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { FakeCoachingLlmAdapter } from '../../src/modules/ai/fake-coaching-llm.adapter';
import { CoachingController } from '../../src/modules/coaching/coaching.controller';
import { CoachingGenerationService } from '../../src/modules/coaching/coaching-generation.service';
import { CoachingPlanService } from '../../src/modules/coaching/coaching-plan.service';
import { SafetyHoldException } from '../../src/modules/coaching/coaching.errors';
import type { ScoredResultDto } from '../../src/modules/assessment/assessment.dto';
import type { GroundingBundle } from '../../src/modules/coaching/ports/coaching-llm.port';

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
  const controller = new CoachingController(service);
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
    const { controller, generation, llm, db } = setup();
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
});
