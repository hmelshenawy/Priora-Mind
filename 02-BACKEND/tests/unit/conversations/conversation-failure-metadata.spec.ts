import { describe, expect, it } from 'vitest';
import { normalizeFailureCode, safeFailureDetail } from '../../../src/modules/conversations/conversation-failure-metadata';

describe('conversation failure metadata', () => {
  it('stores only safe failure codes and sanitized details', () => {
    expect(normalizeFailureCode('LLM_TIMEOUT', 'ORCHESTRATION_FAILED')).toBe('LLM_TIMEOUT');
    expect(normalizeFailureCode('secret stack prompt text', 'ORCHESTRATION_FAILED')).toBe('ORCHESTRATION_FAILED');
    expect(safeFailureDetail('LLM')).toBe('llm_failed');
    expect(safeFailureDetail('LLM')).not.toContain('prompt');
    expect(safeFailureDetail('RAG')).not.toContain('sk-live');
  });
});
