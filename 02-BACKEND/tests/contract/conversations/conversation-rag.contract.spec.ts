import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationRagApiClientService } from '../../../src/modules/conversations/rag/conversation-rag-client.service';

const chunk = {
  chunk_id: 'chunk-1',
  text: 'Grounding text',
  score: 0.9,
  source_id: 'source-1',
  source_title: 'Approved Source',
  source_file: 'source.pdf',
  source_type: 'pdf',
  chunk_index: 1,
  page_number: 2,
  page_start: 2,
  page_end: 3,
  citation_page: 2,
  citation_heading: 'Grounding',
  citation_section: 'Basics',
  text_hash: 'hash-1',
};

describe('conversation RAG client contract', () => {
  beforeEach(() => {
    vi.stubEnv('RAG_BASE_URL', 'https://rag.local');
    vi.stubEnv('RAG_SERVICE_TOKEN', 'token');
    vi.stubEnv('RAG_TIMEOUT_MS', '25');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('maps backend search requests to Python POST /v1/search and normalizes chunk metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [chunk] }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ConversationRagApiClientService().search(
      { question: 'grounding', limit: 6, score_threshold: 0.7 },
      'corr-1',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://rag.local/v1/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token', 'X-Correlation-Id': 'corr-1' }),
        body: JSON.stringify({ question: 'grounding', limit: 6, score_threshold: 0.7 }),
      }),
    );
    expect(result).toMatchObject({ status: 'ok', chunks: [expect.objectContaining({ chunk_id: 'chunk-1' })] });
  });

  it('maps health responses and does not depend on Qdrant directly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', collection_name: 'knowledge', embedding_model: 'embed', embedding_dimension: 384 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ConversationRagApiClientService().health('corr-1');
    expect(fetchMock).toHaveBeenCalledWith('https://rag.local/v1/health', expect.any(Object));
    expect(result).toMatchObject({ status: 'ok', collectionName: 'knowledge', embeddingDimension: 384 });
  });

  it('normalizes errors, malformed responses, and timeout handling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{}] }) }));
    await expect(new ConversationRagApiClientService().search({ question: 'x' }, 'corr-1')).resolves.toMatchObject({
      status: 'invalid_response',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    await expect(new ConversationRagApiClientService().search({ question: 'x' }, 'corr-1')).resolves.toMatchObject({
      status: 'unavailable',
    });

    vi.stubEnv('RAG_TIMEOUT_MS', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
      ),
    );
    await expect(new ConversationRagApiClientService().search({ question: 'x' }, 'corr-1')).resolves.toMatchObject({
      status: 'timeout',
    });
  });
});
