import { describe, expect, it } from 'vitest';
import { FakeConversationAiAdapter } from '../../../src/modules/ai/services/fake-conversation-ai.adapter';

describe('conversation AI port foundation', () => {
  it('returns deterministic grounded answer output with supplied chunk citations', async () => {
    const adapter = new FakeConversationAiAdapter();
    const result = await adapter.generateGroundedAnswer({
      correlationId: 'corr-1',
      productInstructions: ['Stay in scope.'],
      recentHistory: [],
      currentMessage: 'What is grounding?',
      standaloneRetrievalQuery: 'grounding exercise',
      chunks: [
        {
          chunk_id: 'chunk-1',
          score: 0.9,
          text: 'Grounding text',
          source_id: 'source-1',
          source_title: 'Source',
          source_type: 'pdf',
          chunk_index: 1,
          text_hash: 'hash-1',
        },
      ],
    });
    expect(adapter.groundedAnswerCalls).toBe(1);
    expect(result.citations).toEqual([
      { chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' },
    ]);
  });

  it('returns deterministic follow-up rewrites without route classification', async () => {
    const adapter = new FakeConversationAiAdapter();
    const result = await adapter.rewriteFollowUp({
      correlationId: 'corr-1',
      recentHistory: [{ role: 'assistant', content: 'paced breathing' }],
      currentMessage: 'why?',
    });
    expect(adapter.rewriteCalls).toBe(1);
    expect(result.standaloneRetrievalQuery).toContain('paced breathing');
  });
});
