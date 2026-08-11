import { describe, expect, it, vi } from 'vitest';
import { InMemoryPrisma } from '../../../helpers/in-memory-prisma';
import { FakeCoachingLlmAdapter } from '../../../../src/modules/ai/services/fake-coaching-llm.adapter';
import { CoachingGenerationService } from '../../../../src/modules/coaching/services/coaching-generation.service';
import { approvedDisclaimerContentAvailable } from '../../../../src/modules/coaching/constants/coaching-disclaimer';
import { approvedLibraryContentAvailable } from '../../../../src/modules/coaching/constants/coaching-library';
import type { ScoredResultDto } from '../../../../src/modules/assessment/assessment.public';
import type { GroundingBundle, LlmPlanResult } from '../../../../src/modules/ai/ai.public';

const result: ScoredResultDto = {
  resultId: 'result-1',
  assessmentId: 'assessment-1',
  definitionVersion: '1.0',
  domainScores: { stress: { score: 7 } },
  strongestDomain: 'stress',
  supportDomain: 'sleep',
  selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
  goalFreeText: null,
};

const bundle: GroundingBundle = {
  assessment: {
    resultId: result.resultId,
    assessmentId: result.assessmentId,
    definitionVersion: result.definitionVersion,
    domainScores: result.domainScores,
    strongestDomain: result.strongestDomain,
    supportDomain: result.supportDomain,
    selectedPriorities: result.selectedPriorities,
  },
  focusAreaEvidence: [{ domain: 'stress', source: 'priority' }],
  profile: {},
  libraryVersion: '1.0',
  library: {
    domains: [{
      domain: 'stress',
      focusAreaReasons: {},
      goals: [{
        libraryKey: 'goal.stress',
        copy: { en: 'Goal', ar: 'هدف' },
        actions: [{ libraryKey: 'action.stress.1', copy: { en: 'Action 1', ar: 'فعل 1' } }, { libraryKey: 'action.stress.2', copy: { en: 'Action 2', ar: 'فعل 2' } }],
      }],
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

function output(): LlmPlanResult {
  return {
    output: {
      version: '1.0',
      title: { en: 'Plan', ar: 'خطة' },
      summary: { en: 'Summary', ar: 'ملخص' },
      focusAreas: [{ domain: 'stress', source: 'priority', reason: { en: 'Reason', ar: 'سبب' } }],
      goals: [{ libraryKey: 'goal.stress' }],
      actions: [
        { libraryKey: 'action.stress.1', position: 1, pacingLabel: null, copy: { en: 'Action 1', ar: 'فعل 1' } },
        { libraryKey: 'action.stress.2', position: 2, pacingLabel: null, copy: { en: 'Action 2', ar: 'فعل 2' } },
      ],
      disclaimerReference: { version: '1.0' },
    },
    usage: { prompt: 10, completion: 20, total: 30 },
    latencyMs: 12,
    modelId: 'fake-model',
  };
}

function makeService(llm: { generatePlan: (bundle: GroundingBundle) => Promise<LlmPlanResult> } = { generatePlan: vi.fn().mockResolvedValue(output()) }) {
  const db = new InMemoryPrisma();
  const plan = db.coachingPlan.create({ data: {
    userId: 'user-1',
    sourceAssessmentId: result.assessmentId,
    sourceResultId: result.resultId,
    definitionVersion: result.definitionVersion,
    libraryVersion: '1.0',
    disclaimerVersion: '1.0',
    promptVersion: '1.0',
  } });
  const grounding = { assemble: vi.fn().mockResolvedValue(bundle) };
  const service = new CoachingGenerationService(db as never, grounding as never, llm as never);
  return { db, plan, service, grounding, llm };
}

describe('CoachingGenerationService', () => {
  it('keeps production fail-closed while development fixtures satisfy the local content gate', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(approvedLibraryContentAvailable()).toBe(false);
    expect(approvedDisclaimerContentAvailable()).toBe(false);
    process.env.NODE_ENV = 'test';
    expect(approvedLibraryContentAvailable()).toBe(true);
    expect(approvedDisclaimerContentAvailable()).toBe(true);
    process.env.NODE_ENV = original;
  });

  it('persists the complete validated graph atomically with correct relations and ordering', async () => {
    const { db, plan, service } = makeService();
    await service.start(plan, result);
    await service.waitForIdle(plan.id);

    const ready = db.coachingPlanStore.get(plan.id)!;
    const attempts = db.coachingPlanGenerationStore.get(String(ready.currentAttemptId)) ?? [...db.coachingPlanGenerationStore.values()][0];
    const focusAreas = db.focusArea.findMany({ where: { planId: plan.id } });
    const goals = db.goal.findMany({ where: { planId: plan.id } });
    const actions = db.actionStep.findMany({ where: { planId: plan.id } });

    expect(ready.generationStatus).toBe('READY');
    expect(ready.planStatus).toBe('PROPOSED');
    expect(ready.title).toEqual({ en: 'Plan', ar: 'خطة' });
    expect(ready.summary).toEqual({ en: 'Summary', ar: 'ملخص' });
    expect(ready.libraryVersion).toBe('1.0');
    expect(ready.disclaimerVersion).toBe('1.0');
    expect(attempts.status).toBe('READY');
    expect(attempts.provider).toBe('configured');
    expect(attempts.modelId).toBe('fake-model');
    expect(attempts.promptVersion).toBe('1.0');
    expect(attempts.tokenUsage).toEqual({ prompt: 10, completion: 20, total: 30 });
    expect(focusAreas.map((area) => [area.domain, area.position])).toEqual([['stress', 1]]);
    expect(goals.map((goal) => [goal.libraryKey, goal.focusAreaId, goal.position])).toEqual([['goal.stress', focusAreas[0].id, 1]]);
    expect(actions.map((action) => [action.libraryKey, action.goalId, action.focusAreaId, action.position])).toEqual([
      ['action.stress.1', goals[0].id, focusAreas[0].id, 1],
      ['action.stress.2', goals[0].id, focusAreas[0].id, 2],
    ]);
  });

  it('invokes FakeCoachingLlmAdapter and publishes a validated bilingual READY/PROPOSED graph without production placeholder content', async () => {
    const llm = new FakeCoachingLlmAdapter();
    const { db, plan, service } = makeService(llm);
    await service.start(plan, result);
    await service.waitForIdle(plan.id);
    expect(llm.calls).toBe(1);
    expect(approvedLibraryContentAvailable()).toBe(true);
    expect(approvedDisclaimerContentAvailable()).toBe(true);
    expect(db.coachingPlanStore.get(plan.id)).toMatchObject({ generationStatus: 'READY', planStatus: 'PROPOSED' });
    expect(db.focusArea.findMany({ where: { planId: plan.id } })).toHaveLength(1);
    expect(db.goal.findMany({ where: { planId: plan.id } })).toHaveLength(1);
    expect(db.actionStep.findMany({ where: { planId: plan.id } })).toHaveLength(1);
    expect(db.coachingPlanGeneration.findMany({ where: { planId: plan.id } })[0]).toMatchObject({ status: 'READY', validationOutcome: { result: 'VALID', reasons: [] } });
  });

  it('persists no usable graph on grounding, provider, validation, mapping, or transaction failure', async () => {
    for (const arrange of [
      () => ({ grounding: { assemble: vi.fn().mockRejectedValue(new Error('grounding')) }, llm: { generatePlan: vi.fn().mockResolvedValue(output()) }, breakTx: false }),
      () => ({ grounding: { assemble: vi.fn().mockResolvedValue(bundle) }, llm: { generatePlan: vi.fn().mockRejectedValue(new Error('provider')) }, breakTx: false }),
      () => ({ grounding: { assemble: vi.fn().mockResolvedValue(bundle) }, llm: { generatePlan: vi.fn().mockResolvedValue({ ...output(), output: { ...output().output, goals: [{ libraryKey: 'unknown' }] } }) }, breakTx: false }),
      () => ({ grounding: { assemble: vi.fn().mockResolvedValue(bundle) }, llm: { generatePlan: vi.fn().mockResolvedValue({ ...output(), output: { ...output().output, goals: [], actions: output().output.actions } }) }, breakTx: false }),
      () => ({ grounding: { assemble: vi.fn().mockResolvedValue(bundle) }, llm: { generatePlan: vi.fn().mockResolvedValue(output()) }, breakTx: true }),
    ]) {
      const db = new InMemoryPrisma();
      const plan = db.coachingPlan.create({ data: { userId: 'user-1', sourceAssessmentId: result.assessmentId, sourceResultId: result.resultId, definitionVersion: result.definitionVersion, libraryVersion: '1.0', disclaimerVersion: '1.0', promptVersion: '1.0' } });
      const { grounding, llm, breakTx } = arrange();
      if (breakTx) db.actionStep.create = vi.fn().mockImplementation(() => { throw new Error('transaction'); }) as never;
      const service = new CoachingGenerationService(db as never, grounding as never, llm as never);
      await service.start(plan, result);
      await service.waitForIdle(plan.id);
      expect(db.coachingPlanStore.get(plan.id)!.generationStatus).toBe('FAILED');
      expect(db.coachingPlanStore.get(plan.id)!.planStatus).toBeNull();
      expect(db.focusArea.findMany({ where: { planId: plan.id } })).toEqual([]);
      expect(db.goal.findMany({ where: { planId: plan.id } })).toEqual([]);
      expect(db.actionStep.findMany({ where: { planId: plan.id } })).toEqual([]);
    }
  });

  it('does not publish an expired or superseded late result', async () => {
    let resolve!: (value: LlmPlanResult) => void;
    const llm = { generatePlan: vi.fn(() => new Promise<LlmPlanResult>((done) => { resolve = done; })) };
    const { db, plan, service } = makeService(llm);
    await service.start(plan, result);
    await new Promise((done) => setTimeout(done, 10));
    db.coachingPlan.update({ where: { id: plan.id }, data: { currentAttemptId: 'newer-attempt', generationStatus: 'GENERATING' } });
    resolve(output());
    await service.waitForIdle(plan.id);
    expect(db.coachingPlanStore.get(plan.id)!.generationStatus).toBe('GENERATING');
    expect(db.focusArea.findMany({ where: { planId: plan.id } })).toEqual([]);
    expect(db.coachingPlanGeneration.findMany({ where: { planId: plan.id } })[0].status).toBe('GENERATING');
  });

  it('recovers a stale in-flight attempt to PENDING and marks the attempt failed', async () => {
    const { db, plan, service } = makeService();
    db.coachingPlan.update({ where: { id: plan.id }, data: { generationStatus: 'GENERATING', currentAttemptId: 'attempt-stale', generationDeadlineAt: new Date(Date.now() - 1_000), generationStartedAt: new Date(Date.now() - 2_000) } });
    db.coachingPlanGeneration.create({ data: { id: 'attempt-stale', planId: plan.id, attempt: 1, provider: 'configured', modelId: 'configured', promptVersion: '1.0', sourceAssessmentId: result.assessmentId, sourceResultId: result.resultId, definitionVersion: result.definitionVersion, libraryVersion: '1.0', disclaimerVersion: '1.0', status: 'GENERATING', retryCount: 0, startedAt: new Date(Date.now() - 2_000), deadlineAt: new Date(Date.now() - 1_000) } });
    await service.reclaimIfStale(db.coachingPlanStore.get(plan.id)!);
    expect(db.coachingPlanStore.get(plan.id)).toMatchObject({ generationStatus: 'PENDING', currentAttemptId: null, generationDeadlineAt: null });
    expect(db.coachingPlanGenerationStore.get('attempt-stale')).toMatchObject({ status: 'FAILED', errorCode: 'STALE' });
  });

  it('is idempotent for duplicate start requests and creates a new attempt on retry', async () => {
    const llm = new FakeCoachingLlmAdapter();
    const { db, plan, service } = makeService(llm);
    await Promise.all([service.start(plan, result), service.start(plan, result)]);
    await service.waitForIdle(plan.id);
    expect(llm.calls).toBe(1);
    expect(db.coachingPlanGeneration.findMany({ where: { planId: plan.id } })).toHaveLength(1);

    db.coachingPlan.update({ where: { id: plan.id }, data: { generationStatus: 'PENDING', planStatus: null } });
    await service.start(db.coachingPlanStore.get(plan.id)!, result);
    await service.waitForIdle(plan.id);
    expect(db.coachingPlanGeneration.findMany({ where: { planId: plan.id } }).map((attempt) => attempt.attempt)).toEqual([1, 2]);
  });
});
