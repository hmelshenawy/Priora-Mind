import type { CoachingLlmPort, GroundingBundle, LlmPlanResult } from '../ports/coaching-llm.port';

export class FakeCoachingLlmAdapter implements CoachingLlmPort {
  calls = 0;

  async generatePlan(bundle: GroundingBundle): Promise<LlmPlanResult> {
    this.calls += 1;
    const domain = bundle.library.domains[0];
    const goal = domain?.goals[0];
    const action = goal?.actions[0];
    return {
      output: {
        version: '1.0',
        title: { en: 'Fixture coaching plan', ar: 'خطة توجيه تجريبية' },
        summary: { en: 'Fixture summary', ar: 'ملخص تجريبي' },
        focusAreas: domain ? [{ domain: domain.domain, source: 'priority', reason: { en: 'Fixture reason', ar: 'سبب تجريبي' } }] : [],
        goals: goal ? [{ libraryKey: goal.libraryKey }] : [],
        actions: action ? [{ libraryKey: action.libraryKey, position: 1, pacingLabel: action.pacingLabel ?? null, copy: action.copy }] : [],
        disclaimerReference: { version: bundle.disclaimerVersion },
      },
      usage: { prompt: 0, completion: 0, total: 0 },
      latencyMs: 0,
      modelId: 'fake-coaching-llm',
    };
  }
}
