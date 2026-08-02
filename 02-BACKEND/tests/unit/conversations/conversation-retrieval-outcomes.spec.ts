import { describe, expect, it } from 'vitest';
import { buildInsufficientEvidenceResponse } from '../../../src/modules/conversations/conversation-insufficient-evidence';
import { ConversationGroundingService } from '../../../src/modules/conversations/conversation-grounding.service';

const validChunk = {
  chunk_id: 'chunk-1',
  text: 'Approved grounding content.',
  score: 0.91,
  source_id: 'source-1',
  source_title: 'Approved Source',
  source_type: 'pdf' as const,
  chunk_index: 1,
  text_hash: 'hash-1',
};

describe('conversation retrieval outcomes', () => {
  it('treats empty and low-score retrieval as insufficient without usable chunks', () => {
    const grounding = new ConversationGroundingService();
    expect(grounding.selectSufficientChunks({ status: 'ok', correlationId: 'corr', chunks: [] })).toEqual([]);
    expect(
      grounding.selectSufficientChunks({
        status: 'ok',
        correlationId: 'corr',
        chunks: [{ ...validChunk, score: 0.2 }],
      }),
    ).toEqual([]);
  });

  it('filters duplicate and invalid chunks before LLM use', () => {
    const chunks = new ConversationGroundingService().selectSufficientChunks({
      status: 'ok',
      correlationId: 'corr',
      chunks: [validChunk, validChunk, { ...validChunk, chunk_id: '', text_hash: 'hash-2' }],
    });
    expect(chunks).toEqual([validChunk]);
  });

  it('uses bounded insufficient-evidence copy without unsupported claims', () => {
    const copy = buildInsufficientEvidenceResponse();
    expect(copy).toContain("don't have enough grounded information");
    expect(copy).not.toMatch(/diagnos|therap|prescrib|treat/i);
  });
});
