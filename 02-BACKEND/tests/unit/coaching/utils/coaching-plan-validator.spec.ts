import { describe, expect, it } from 'vitest';
import { validateLlmPlanOutput } from '../../../../src/modules/coaching/utils/coaching-plan-validator';
import type { GroundingBundle, LlmPlanOutput } from '../../../../src/modules/ai/ai.public';

const bundle: GroundingBundle = {
  assessment: {
    resultId: 'result-1',
    assessmentId: 'assessment-1',
    definitionVersion: '1.0',
    domainScores: { stress: { score: 7, band: 'elevated' }, sleep: { score: 4, band: 'moderate' } },
    strongestDomain: 'stress',
    supportDomain: 'sleep',
    selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
  },
  focusAreaEvidence: [{ domain: 'stress', source: 'priority' }, { domain: 'sleep', source: 'support' }],
  profile: {},
  libraryVersion: '1.0',
  library: {
    domains: [{
      domain: 'stress',
      focusAreaReasons: {},
      goals: [{ libraryKey: 'goal.stress', copy: { en: 'Goal', ar: 'هدف' }, actions: [{ libraryKey: 'action.stress', copy: { en: 'Action', ar: 'فعل' } }] }],
    }, {
      domain: 'sleep',
      focusAreaReasons: {},
      goals: [{ libraryKey: 'goal.sleep', copy: { en: 'Sleep goal', ar: 'هدف النوم' }, actions: [{ libraryKey: 'action.sleep', copy: { en: 'Sleep action', ar: 'فعل النوم' } }] }],
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

const output: LlmPlanOutput = {
  version: '1.0',
  title: { en: 'Plan', ar: 'خطة' },
  summary: { en: 'Summary', ar: 'ملخص' },
  focusAreas: [{ domain: 'stress', source: 'priority', reason: { en: 'Reason', ar: 'سبب' } }],
  goals: [{ libraryKey: 'goal.stress' }],
  actions: [{ libraryKey: 'action.stress', position: 1, pacingLabel: null, copy: { en: 'Action', ar: 'فعل' } }],
  disclaimerReference: { version: '1.0' },
};

describe('validateLlmPlanOutput', () => {
  it('accepts bilingual output constrained to approved library keys', () => {
    expect(validateLlmPlanOutput(output, bundle)).toEqual({ valid: true, reasons: [] });
  });

  it('rejects unknown library keys and unsafe clinical content', () => {
    const invalid = { ...output, summary: { en: 'Medication advice', ar: 'نصيحة' }, goals: [{ libraryKey: 'unknown' }] };
    const result = validateLlmPlanOutput(invalid, bundle);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('UNKNOWN_GOAL_LIBRARY_KEY');
    expect(result.reasons).toContain('CONCERNING_OUTPUT');
  });

  it('rejects missing required bilingual sections', () => {
    const invalid = {
      ...output,
      title: { en: 'Plan', ar: '' },
      focusAreas: [{ ...output.focusAreas[0], reason: { en: '', ar: 'سبب' } }],
      actions: [{ ...output.actions[0], copy: { en: 'Action', ar: '' } }],
    };
    const result = validateLlmPlanOutput(invalid, bundle);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('TITLE_BILINGUAL_REQUIRED');
    expect(result.reasons).toContain('FOCUS_REASON_BILINGUAL_REQUIRED');
    expect(result.reasons).toContain('ACTION_COPY_BILINGUAL_REQUIRED');
  });

  it('rejects limit violations and duplicate graph ids', () => {
    const invalid = {
      ...output,
      focusAreas: [
        output.focusAreas[0],
        { domain: 'sleep', source: 'support' as const, reason: { en: 'Reason', ar: 'سبب' } },
        { domain: 'stress', source: 'priority' as const, reason: { en: 'Reason', ar: 'سبب' } },
        { domain: 'unknown', source: 'priority' as const, reason: { en: 'Reason', ar: 'سبب' } },
      ],
      goals: Array.from({ length: 10 }, () => ({ libraryKey: 'goal.stress' })),
      actions: Array.from({ length: 19 }, () => output.actions[0]),
    };
    const result = validateLlmPlanOutput(invalid, bundle);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('FOCUS_AREA_LIMIT');
    expect(result.reasons).toContain('DUPLICATE_FOCUS_AREA');
    expect(result.reasons).toContain('GOAL_LIMIT');
    expect(result.reasons).toContain('DUPLICATE_GOAL_LIBRARY_KEY');
    expect(result.reasons).toContain('ACTION_LIMIT');
    expect(result.reasons).toContain('DUPLICATE_ACTION_LIBRARY_KEY');
  });

  it('rejects focus areas that do not trace to assessment evidence', () => {
    const invalid = { ...output, focusAreas: [{ domain: 'nutrition', source: 'priority' as const, reason: { en: 'Reason', ar: 'سبب' } }] };
    const result = validateLlmPlanOutput(invalid, bundle);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('UNSUPPORTED_FOCUS_AREA');
  });

  it('rejects invalid action structure and disclaimer/library mismatches', () => {
    const invalid = {
      ...output,
      actions: [{ ...output.actions[0], position: 0, pacingLabel: { en: '', ar: 'وتيرة' } }],
      disclaimerReference: { version: '2.0' },
    };
    const result = validateLlmPlanOutput(invalid, { ...bundle, library: { ...bundle.library, domains: [] } });
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('ACTION_POSITION_INVALID');
    expect(result.reasons).toContain('ACTION_PACING_BILINGUAL_REQUIRED');
    expect(result.reasons).toContain('DISCLAIMER_VERSION_MISMATCH');
    expect(result.reasons).toContain('LIBRARY_EMPTY');
  });
});
