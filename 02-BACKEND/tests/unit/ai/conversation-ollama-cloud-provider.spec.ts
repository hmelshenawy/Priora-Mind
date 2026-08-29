import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationLlmProviderRequest } from '../../../src/modules/ai/ports/conversation-llm-provider';
import { OllamaConversationLlmProvider } from '../../../src/modules/ai/providers/ollama-conversation-llm.provider';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['content', 'citations'],
  properties: {
    content: { type: 'string', minLength: 1 },
    citations: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chunk_id', 'source_id', 'text_hash'],
        properties: {
          chunk_id: { type: 'string' },
          source_id: { type: 'string' },
          text_hash: { type: 'string' },
        },
      },
    },
  },
};

const request: ConversationLlmProviderRequest = {
  instructions: 'Use supplied evidence only.',
  input: '{"supportingEvidence":[]}',
  schemaName: 'grounded_answer',
  schema,
};

const valid = {
  content: 'CBT is a structured approach.',
  citations: [{ chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' }],
};

function response(content: string) {
  return new Response(JSON.stringify({ model: 'qwen3.5', message: { content } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function client(model = 'qwen3.5:cloud', baseUrl = 'http://127.0.0.1:11434', timeoutMs = 100) {
  return new OllamaConversationLlmProvider(model, baseUrl, timeoutMs, 'test-key');
}

describe('Ollama local and cloud structured responses', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the local Ollama strict structured-output request unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify(valid)));
    vi.stubGlobal('fetch', fetchMock);
    await client('qwen3:1.7b').complete(request);

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(body.format).toEqual(schema);
    expect(body.messages[0].content).toBe(request.instructions);
  });

  it('uses JSON mode for cloud models and states the exact schema in the prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify(valid)));
    vi.stubGlobal('fetch', fetchMock);
    await client().complete(request);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.format).toBe('json');
    expect(body.format).not.toEqual(schema);
    expect(body.stream).toBe(false);
    expect(body.messages[0].content).toContain(JSON.stringify(schema));
    expect(body.messages[0].content).toContain('Return only the root JSON object');
    expect(body.messages[0].content).toContain('do not wrap it in a property named grounded_answer');
  });

  it('accepts valid cloud JSON after exact local schema validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(JSON.stringify(valid))));
    await expect(client().complete(request)).resolves.toMatchObject({
      value: valid,
      modelId: 'qwen3.5',
      usage: undefined,
    });
  });

  it('safely accepts a single complete JSON Markdown fence in cloud mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)));
    await expect(client().complete(request)).resolves.toMatchObject({ value: valid });
  });

  it.each([
    ['malformed JSON', '{not-json'],
    ['missing content', JSON.stringify({ citations: valid.citations })],
    ['missing citations', JSON.stringify({ content: valid.content })],
    ['empty content', JSON.stringify({ ...valid, content: '' })],
    ['empty citations', JSON.stringify({ ...valid, citations: [] })],
    ['extra properties', JSON.stringify({ ...valid, internal: 'not allowed' })],
  ])('rejects %s', async (_case, content) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(content)));
    await expect(client().complete(request)).rejects.toMatchObject({ code: 'LLM_INVALID_OUTPUT' });
  });

  it.each([
    [401, 'LLM_UNAVAILABLE'],
    [403, 'LLM_UNAVAILABLE'],
    [429, 'LLM_RATE_LIMITED'],
    [500, 'LLM_UNAVAILABLE'],
    [400, 'LLM_INVALID_OUTPUT'],
  ])('preserves cloud HTTP %s mapping to %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(client().complete(request)).rejects.toMatchObject({ code });
  });

  it('supports both documented direct-cloud base URL forms', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify(valid)));
    vi.stubGlobal('fetch', fetchMock);
    await client('qwen3.5:cloud', 'https://ollama.com/api').complete(request);
    expect(fetchMock.mock.calls[0][0]).toBe('https://ollama.com/api/chat');
  });
});

const followUpSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['standaloneRetrievalQuery'],
  properties: { standaloneRetrievalQuery: { type: 'string', minLength: 1 } },
};

const followUpRequest: ConversationLlmProviderRequest = {
  instructions:
    'Rewrite the current message as one standalone retrieval query using only the supplied conversation history. Return JSON matching the required schema. Do not answer the question.',
  input: '{"recentHistory":[],"currentMessage":"How do I stop it before meetings?"}',
  schemaName: 'follow_up_rewrite',
  schema: followUpSchema,
};

/** fetch mock that rejects with an AbortError when the request signal aborts. */
function signalRespectingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      reject(err);
    });
  }));
}

describe('Ollama follow-up rewrite transport diagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1. completes a follow-up rewrite through Ollama Cloud JSON mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(JSON.stringify({ standaloneRetrievalQuery: 'how to manage work anxiety before meetings' })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await client('qwen3.5:cloud', 'http://127.0.0.1:11434', 5000).complete(followUpRequest);
    expect(result.value).toEqual({ standaloneRetrievalQuery: 'how to manage work anxiety before meetings' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('qwen3.5:cloud');
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.format).toBe('json');
  });

  it('2. rejects an HTTP 200 response carrying an Ollama error object as LLM_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'model load failed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(client().complete(followUpRequest)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      diagnostics: { networkCategory: 'provider_error_body', httpStatus: 200, aborted: false },
    });
  });

  it('3. classifies a timeout abort as LLM_TIMEOUT, not LLM_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', signalRespectingFetch());
    const promise = client('qwen3.5:cloud', 'http://127.0.0.1:11434', 30).complete(followUpRequest);
    await expect(promise).rejects.toMatchObject({
      code: 'LLM_TIMEOUT',
      diagnostics: { networkCategory: 'abort', aborted: true },
    });
  });

  it('3b. classifies an undici-wrapped abort (TypeError cause AbortError) as LLM_TIMEOUT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new TypeError('fetch failed');
          err.cause = { name: 'AbortError' };
          reject(err);
        });
      })),
    );
    const promise = client('qwen3.5:cloud', 'http://127.0.0.1:11434', 30).complete(followUpRequest);
    await expect(promise).rejects.toMatchObject({
      code: 'LLM_TIMEOUT',
      diagnostics: { networkCategory: 'abort', aborted: true, exceptionName: 'TypeError' },
    });
  });

  it('4. classifies a network connection failure as LLM_UNAVAILABLE', async () => {
    const err = new TypeError('fetch failed');
    err.cause = { code: 'ECONNREFUSED' };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
    await expect(client().complete(followUpRequest)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      diagnostics: { networkCategory: 'refused', aborted: false, exceptionName: 'TypeError' },
    });
  });

  it.each([
    [500, 'LLM_UNAVAILABLE'],
    [502, 'LLM_UNAVAILABLE'],
    [503, 'LLM_UNAVAILABLE'],
  ])('5. maps HTTP %i to %s with an http_status diagnostic', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(client().complete(followUpRequest)).rejects.toMatchObject({
      code,
      diagnostics: { networkCategory: 'http_status', httpStatus: status, aborted: false },
    });
  });

  it('6. clears the timeout timer after a successful response', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(JSON.stringify(valid))));
    await client('qwen3.5:cloud', 'http://127.0.0.1:11434', 5000).complete(request);
    expect(setTimeoutSpy).toHaveBeenCalled();
    const timerId = setTimeoutSpy.mock.results.at(-1)?.value;
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId);
  });

  it('7. does not share AbortController state between concurrent requests', async () => {
    const fetchMock = vi
      .fn()
      // A: respects the signal, will be aborted by its own short timer.
      .mockImplementationOnce((_url, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('This operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }))
      // B: resolves immediately and must remain unaffected by A's abort.
      .mockResolvedValueOnce(response(JSON.stringify({ standaloneRetrievalQuery: 'how to manage work anxiety' })));
    vi.stubGlobal('fetch', fetchMock);
    const c = client('qwen3.5:cloud', 'http://127.0.0.1:11434', 30);
    const aPromise = c.complete(followUpRequest);
    const bPromise = c.complete(followUpRequest);
    await expect(bPromise).resolves.toMatchObject({ value: { standaloneRetrievalQuery: 'how to manage work anxiety' } });
    await expect(aPromise).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
  });
});
