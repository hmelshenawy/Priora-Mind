import { describe, expect, it } from 'vitest';
import { ConversationCitationMapper } from '../../../../src/modules/conversations/utils/conversation-citation-mapper';

const chunk = {
  chunk_id: 'chunk-1',
  text: 'Grounding text',
  score: 0.92,
  source_id: 'source-1',
  source_title: 'Grounding Guide',
  source_file: 'guide.pdf',
  source_type: 'pdf' as const,
  chunk_index: 3,
  page_number: 4,
  page_start: 4,
  page_end: 5,
  citation_heading: 'Grounding',
  citation_section: 'Basics',
  text_hash: 'hash-1',
};

describe('conversation citation mapper', () => {
  it('maps supplied chunk citations with page range metadata', () => {
    const sources = new ConversationCitationMapper().map(
      {
        content: 'Use grounding.',
        citations: [{ chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' }],
        modelId: 'fake',
      },
      [chunk],
    );
    expect(sources).toEqual([
      expect.objectContaining({
        chunkId: 'chunk-1',
        sourceId: 'source-1',
        citationPage: 4,
        pageStart: 4,
        pageEnd: 5,
        displayOrder: 1,
      }),
    ]);
  });

  it('rejects unknown chunk citations', () => {
    expect(() =>
      new ConversationCitationMapper().map(
        {
          content: 'Bad citation.',
          citations: [{ chunk_id: 'missing', source_id: 'source-1', text_hash: 'hash-1' }],
          modelId: 'fake',
        },
        [chunk],
      ),
    ).toThrow('UNKNOWN_RAG_CITATION');
  });

  it('uses fallback display metadata when page fields are missing', () => {
    const sources = new ConversationCitationMapper().map(
      {
        content: 'Use grounding.',
        citations: [{ chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' }],
        modelId: 'fake',
      },
      [{ ...chunk, page_number: undefined, page_start: undefined, page_end: undefined }],
    );
    expect(sources[0]).toMatchObject({ sourceTitle: 'Grounding Guide', sourceFile: 'guide.pdf' });
    expect(sources[0].citationPage).toBeNull();
  });

  it('preserves model citation order as one-based display indexes', () => {
    const second = {
      ...chunk,
      chunk_id: 'chunk-2',
      source_id: 'source-2',
      text_hash: 'hash-2',
      chunk_index: 4,
    };
    const sources = new ConversationCitationMapper().map(
      {
        content: 'Grounded answer with ordered citations.',
        citations: [
          { chunk_id: 'chunk-2', source_id: 'source-2', text_hash: 'hash-2' },
          { chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' },
        ],
        modelId: 'fake',
      },
      [chunk, second],
    );
    expect(sources.map(({ chunkId, chunkIndex, displayOrder }) => ({ chunkId, chunkIndex, displayOrder }))).toEqual([
      { chunkId: 'chunk-2', chunkIndex: 4, displayOrder: 1 },
      { chunkId: 'chunk-1', chunkIndex: 3, displayOrder: 2 },
    ]);
  });
});
