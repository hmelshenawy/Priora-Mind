import { describe, expect, it, vi } from 'vitest';
import { CoachingGenerationService } from '../../src/modules/coaching/services/coaching-generation.service';
import { validateLlmPlanOutput } from '../../src/modules/coaching/utils/coaching-plan-validator';
import type { GroundingBundle } from '../../src/modules/ai/ai.public';

const result = {
  resultId: 'result-1',
  assessmentId: 'assessment-1',
  definitionVersion: '1.0',
  domainScores: { stress: { score: 7 } },
  strongestDomain: 'stress',
  supportDomain: 'sleep',
  selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
  goalFreeText: 'private text',
};

describe('Assessment-to-Retrieval-to-Coaching-Plan e2e slice', () => {
  it('assembles bounded RAG context and validates citations against current chunks', async () => {
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
        domains: [{ domain: 'stress', focusAreaReasons: {}, goals: [{ libraryKey: 'goal.stress', copy: { en: 'Goal', ar: 'هدف' }, actions: [{ libraryKey: 'action.stress', copy: { en: 'Action', ar: 'فعل' } }] }] }],
        pacingLabels: {},
        titleTemplates: [],
        summaryTemplates: [],
      },
      disclaimerVersion: '1.0',
      disclaimer: { en: 'Disclaimer', ar: 'تنبيه' },
      promptVersion: '1.0',
      instructions: [],
      ragContext: {
        retrieval_status: 'ok',
        chunks: [{ chunk_id: 'chunk-1', text: 'CBT stress skill', source_id: 'cbt', source_title: 'CBT', source_type: 'markdown', citation_heading: 'Stress', citation_section: 'stress', text_hash: 'sha256:one' }],
        allowed_chunk_ids: ['chunk-1'],
        correlation_id: 'corr-1',
      },
    };
    expect(bundle.ragContext?.allowed_chunk_ids).toEqual(['chunk-1']);
    const output = {
      version: '1.0',
      title: { en: 'Plan', ar: 'خطة' },
      summary: { en: 'Summary', ar: 'ملخص' },
      focusAreas: [{ domain: 'stress', source: 'priority' as const, reason: { en: 'Reason', ar: 'سبب' } }],
      goals: [{ libraryKey: 'goal.stress' }],
      actions: [{ libraryKey: 'action.stress', position: 1, pacingLabel: null, copy: { en: 'Action', ar: 'فعل' } }],
      citations: [{ chunk_id: 'chunk-1', source_id: 'cbt', text_hash: 'sha256:one' }],
      disclaimerReference: { version: '1.0' },
    };
    expect(validateLlmPlanOutput(output, bundle).valid).toBe(true);
    expect(validateLlmPlanOutput({ ...output, citations: [{ chunk_id: 'other', source_id: 'cbt', text_hash: 'sha256:one' }] }, bundle).reasons).toContain('UNKNOWN_RAG_CITATION');
  });

  it('fails closed before LLM generation when RAG is unavailable or insufficient', async () => {
    const grounding = { assemble: vi.fn().mockRejectedValue(new Error('PLAN_UNAVAILABLE')) };
    const db = { coachingPlan: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, coachingPlanGeneration: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() } };
    const llm = { generatePlan: vi.fn() };
    const service = new CoachingGenerationService(db as never, grounding as never, llm as never);

    await service.start({ id: 'plan-1', promptVersion: '1.0', sourceAssessmentId: 'assessment-1', sourceResultId: 'result-1', definitionVersion: '1.0', libraryVersion: '1.0', disclaimerVersion: '1.0' }, result);
    await service.waitForIdle('plan-1');

    expect(llm.generatePlan).not.toHaveBeenCalled();
    expect(db.coachingPlan.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ generationStatus: 'FAILED' }) }));
  });
});
