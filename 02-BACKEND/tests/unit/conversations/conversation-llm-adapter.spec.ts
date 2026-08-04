import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroundedAnswerRequest } from '../../../src/modules/ai/conversation-ai.port';
import {
  ConversationLlmAdapter,
  ConversationLlmError,
} from '../../../src/modules/ai/conversation-llm.adapter';

const request: GroundedAnswerRequest = {
  correlationId: 'request-123',
  productInstructions: ['Use supplied evidence only.'],
  recentHistory: [],
  currentMessage: 'private user content',
  standaloneRetrievalQuery: 'What is CBT?',
  chunks: [
    {
      chunk_id: 'chunk-1',
      text: 'private retrieved content',
      score: 0.5,
      source_id: 'source-1',
      source_title: 'Source',
      source_type: 'pdf',
      chunk_index: 1,
      text_hash: 'hash-1',
    },
  ],
};

function openAiResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      model: 'gpt-test',
      output_text: JSON.stringify({
        content: 'CBT is a structured approach.',
        citations: [{ chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' }],
      }),
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('conversation real LLM adapter', () => {
  beforeEach(() => {
    vi.stubEnv('COACHING_LLM_PROVIDER', 'openai');
    vi.stubEnv('COACHING_LLM_MODEL', 'gpt-test');
    vi.stubEnv('COACHING_LLM_TIMEOUT_MS', '100');
    vi.stubEnv('OPENAI_API_KEY', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a structured grounded completion with optional usage absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse());
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).resolves.toMatchObject({
      content: 'CBT is a structured approach.',
      citations: [{ chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' }],
      modelId: 'gpt-test',
      usage: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
    const providerBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(providerBody.text.format).toMatchObject({
      type: 'json_schema',
      name: 'grounded_answer',
      strict: true,
      schema: {
        additionalProperties: false,
        required: ['content', 'citations'],
      },
    });
    const providerInput = JSON.parse(providerBody.input);
    expect(providerInput).toEqual({
      turnContext: {
        isContinuingConversation: false,
        mustAdvanceBeyondPriorAssistantResponses: false,
      },
      conversationHistoryChronological: [],
      currentUserMessage: request.currentMessage,
      standaloneRetrievalQuery: request.standaloneRetrievalQuery,
      supportingEvidence: [
        {
          chunk_id: 'chunk-1',
          source_id: 'source-1',
          text_hash: 'hash-1',
          text: request.chunks[0].text,
        },
      ],
    });
  });

  it.each([
    [401, 'LLM_UNAVAILABLE'],
    [403, 'LLM_UNAVAILABLE'],
    [500, 'LLM_UNAVAILABLE'],
    [429, 'LLM_RATE_LIMITED'],
    [400, 'LLM_INVALID_OUTPUT'],
  ])('normalizes HTTP %s to %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).rejects.toMatchObject({ code });
  });

  it('normalizes timeout and provider connectivity failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new DOMException('aborted', 'AbortError')));
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).rejects.toMatchObject({
      code: 'LLM_TIMEOUT',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')));
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
  });

  it('rejects malformed, empty, and incomplete provider output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(openAiResponse({ output_text: 'not-json' })));
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).rejects.toMatchObject({
      code: 'LLM_INVALID_OUTPUT',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        openAiResponse({ output_text: JSON.stringify({ content: '', citations: [] }) }),
      ),
    );
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).rejects.toMatchObject({
      code: 'LLM_INVALID_OUTPUT',
    });
  });

  it('keeps disabled and incomplete configuration available', async () => {
    vi.stubEnv('COACHING_LLM_PROVIDER', 'disabled');
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).rejects.toBeInstanceOf(
      ConversationLlmError,
    );
    vi.stubEnv('COACHING_LLM_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).rejects.toMatchObject({
      code: 'LLM_DISABLED',
    });
  });

  it('supports Ollama structured output and token usage', async () => {
    vi.stubEnv('COACHING_LLM_PROVIDER', 'ollama');
    vi.stubEnv('COACHING_LLM_MODEL', 'qwen-test');
    vi.stubEnv('OLLAMA_BASE_URL', 'http://ollama.local');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'qwen-test',
            message: {
              content: JSON.stringify({
                content: 'Grounded answer.',
                citations: [{ chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' }],
              }),
            },
            prompt_eval_count: 10,
            eval_count: 5,
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).resolves.toMatchObject({
      modelId: 'qwen-test',
      usage: { prompt: 10, completion: 5, total: 15 },
    });
  });

  it('preserves Arabic structured output without translation or normalization', async () => {
    const arabicContent = 'العلاج المعرفي السلوكي نهج منظم يربط الأفكار والمشاعر والسلوك.';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        openAiResponse({
          output_text: JSON.stringify({
            content: arabicContent,
            citations: [{ chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' }],
          }),
        }),
      ),
    );
    const result = await new ConversationLlmAdapter().generateGroundedAnswer({
      ...request,
      currentMessage: 'ما هو العلاج المعرفي السلوكي؟',
    });
    expect(result.content).toBe(arabicContent);
  });

  it('logs only safe diagnostics for provider failures', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    await expect(new ConversationLlmAdapter().generateGroundedAnswer(request)).rejects.toMatchObject({
      code: 'LLM_RATE_LIMITED',
    });
    const serialized = JSON.stringify(warn.mock.calls);
    expect(serialized).toContain('openai');
    expect(serialized).toContain('gpt-test');
    expect(serialized).toContain('LLM_RATE_LIMITED');
    expect(serialized).toContain('request-123');
    expect(serialized).not.toContain(request.currentMessage);
    expect(serialized).not.toContain(request.chunks[0].text);
    expect(serialized).not.toContain('test-secret');
  });
});
