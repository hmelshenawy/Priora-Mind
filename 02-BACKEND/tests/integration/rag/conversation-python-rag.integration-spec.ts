import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationRagApiClientService } from '../../../src/modules/conversations/rag/conversation-rag-client.service';

describe('conversation backend to Python RAG integration contract', () => {
  beforeEach(() => {
    vi.stubEnv('RAG_BASE_URL', 'http://python-rag.local');
    vi.stubEnv('RAG_SERVICE_TOKEN', 'fixture-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses authenticated Python /v1/search mapping with no paid LLM provider call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            chunk_id: 'fixture-chunk',
            text: 'Fixture RAG text',
            score: 0.9,
            source_id: 'fixture-source',
            source_title: 'Fixture Source',
            source_file: 'fixture.pdf',
            source_type: 'pdf',
            chunk_index: 0,
            page_number: 1,
            page_start: 1,
            page_end: 1,
            citation_page: 1,
            citation_heading: 'Fixture',
            citation_section: 'Test',
            text_hash: 'sha256:fixture',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ConversationRagApiClientService().search(
      { question: 'grounding fixture', limit: 6, score_threshold: 0.7 },
      'corr-fixture',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://python-rag.local/v1/search',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fixture-token' }) }),
    );
    expect(result).toMatchObject({ status: 'ok', chunks: [expect.objectContaining({ chunk_id: 'fixture-chunk' })] });
  });
});
