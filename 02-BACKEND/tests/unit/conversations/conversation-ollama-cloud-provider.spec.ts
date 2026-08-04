import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationLlmProviderRequest } from '../../../src/modules/ai/conversation-llm-provider';
import { OllamaConversationLlmProvider } from '../../../src/modules/ai/ollama-conversation-llm.provider';

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

function client(model = 'qwen3.5:cloud', baseUrl = 'http://127.0.0.1:11434') {
  return new OllamaConversationLlmProvider(model, baseUrl, 100, 'test-key');
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
    expect(body.messages[0].content).toContain('Return only one JSON object');
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
