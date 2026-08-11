import { describe, expect, it } from 'vitest';
import {
  ConversationLlmError,
  normalizeAiFailureCode,
} from '../../../src/modules/ai/ai.public';
import { ConversationCitationMapper } from '../../../src/modules/conversations/utils/conversation-citation-mapper';

describe('conversation LLM failures', () => {
  it('normalizes configured provider failure classes', () => {
    expect(normalizeAiFailureCode(new ConversationLlmError('LLM_DISABLED'))).toBe('LLM_DISABLED');
    expect(normalizeAiFailureCode(new Error('rate limit exceeded'))).toBe('LLM_RATE_LIMITED');
    expect(normalizeAiFailureCode(new DOMException('aborted', 'AbortError'))).toBe('LLM_TIMEOUT');
    expect(normalizeAiFailureCode(new Error('malformed json'))).toBe('LLM_INVALID_OUTPUT');
    expect(normalizeAiFailureCode(new Error('unsafe answer'))).toBe('LLM_UNSAFE_OUTPUT');
  });

  it('rejects unsupported citations before persistence', () => {
    expect(() =>
      new ConversationCitationMapper().map(
        {
          content: 'Grounded answer',
          citations: [{ chunk_id: 'unknown', source_id: 'source-1', text_hash: 'hash-1' }],
          modelId: 'fake',
        },
        [],
      ),
    ).toThrow('UNKNOWN_RAG_CITATION');
  });
});
