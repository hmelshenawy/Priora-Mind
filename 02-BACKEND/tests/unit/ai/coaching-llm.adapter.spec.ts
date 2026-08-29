import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CoachingLlmAdapter } from '../../../src/modules/ai/services/coaching-llm.adapter';
import { isPlanOutput } from '../../../src/modules/ai/dto/coaching-plan.schema';
import { ConversationLlmError } from '../../../src/modules/ai/utils/conversation-llm.errors';
import { matchesConversationSchema } from '../../../src/modules/ai/utils/conversation-json-schema-validator';
import type { GroundingBundle, LlmPlanOutput } from '../../../src/modules/ai/ports/coaching-llm.port';

const valid: LlmPlanOutput = {
  version: '1.0', title: { en: 'Plan', ar: 'خطة' }, summary: { en: 'Summary', ar: 'ملخص' },
  focusAreas: [{ domain: 'stress', source: 'priority', reason: { en: 'Reason', ar: 'سبب' } }],
  goals: [{ libraryKey: 'dev.goal.stress' }],
  actions: [{ libraryKey: 'dev.action.stress.check-in', position: 1, pacingLabel: null, copy: { en: 'Step', ar: 'خطوة' } }],
  disclaimerReference: { version: '1.0' },
};

describe('CoachingLlmAdapter structured output', () => {
  it('accepts complete bilingual output and rejects malformed or incomplete output', () => {
    expect(isPlanOutput(valid)).toBe(true);
    expect(isPlanOutput({ ...valid, title: { en: 'Plan', ar: '' } })).toBe(false);
    expect(isPlanOutput({ ...valid, summary: { en: '', ar: 'ملخص' } })).toBe(false);
    expect(isPlanOutput({ broken: true })).toBe(false);
  });

  it('validates numeric structured-output fields used by action positions', () => {
    expect(matchesConversationSchema(1, { type: 'number', minimum: 1 })).toBe(true);
    expect(matchesConversationSchema(0, { type: 'number', minimum: 1 })).toBe(false);
  });

  it('maps a disabled provider to the existing normalized failure', async () => {
    const config = new ConfigService({ COACHING_LLM_PROVIDER: 'disabled', COACHING_LLM_MODEL: 'none' });
    const adapter = new CoachingLlmAdapter(config);
    await expect(adapter.generatePlan({ instructions: [] } as unknown as GroundingBundle)).rejects.toEqual(
      expect.objectContaining<Partial<ConversationLlmError>>({ code: 'LLM_DISABLED' }),
    );
  });

  it.each([
    ['timeout', new DOMException('timed out', 'AbortError'), 'LLM_TIMEOUT'],
    ['rate limit', new ConversationLlmError('LLM_RATE_LIMITED'), 'LLM_RATE_LIMITED'],
    ['unavailable', new ConversationLlmError('LLM_UNAVAILABLE'), 'LLM_UNAVAILABLE'],
  ])('preserves %s provider failures', async (_name, failure, code) => {
    const adapter = new CoachingLlmAdapter(new ConfigService({ COACHING_LLM_PROVIDER: 'ollama', COACHING_LLM_MODEL: 'model' }));
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(failure);
    await expect(adapter.generatePlan({ instructions: [] } as unknown as GroundingBundle)).rejects.toMatchObject(
      { code },
    );
  });
});
