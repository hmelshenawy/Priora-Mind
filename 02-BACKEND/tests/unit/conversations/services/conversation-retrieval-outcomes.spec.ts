import { describe, expect, it } from 'vitest';
import { buildInsufficientEvidenceResponse } from '../../../../src/modules/conversations/utils/conversation-insufficient-evidence';
import { ConversationGroundingService } from '../../../../src/modules/conversations/services/conversation-grounding.service';

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
  it('accepts calibrated CBT and anxiety results', () => {
    const grounding = new ConversationGroundingService();
    const chunks = grounding.selectSufficientChunks({
      status: 'ok',
      correlationId: 'corr',
      chunks: [
        { ...validChunk, chunk_id: 'cbt', score: 0.46743292 },
        { ...validChunk, chunk_id: 'anxiety', score: 0.63354 },
      ],
    });
    expect(chunks.map((chunk) => chunk.chunk_id)).toEqual(['cbt', 'anxiety']);
  });

  it('rejects calibrated unrelated results', () => {
    const grounding = new ConversationGroundingService();
    expect(
      grounding.selectSufficientChunks({
        status: 'ok',
        correlationId: 'corr',
        chunks: [{ ...validChunk, chunk_id: 'flat-tire', score: 0.419188 }],
      }),
    ).toEqual([]);
  });

  it('treats empty retrieval as insufficient without usable chunks', () => {
    const grounding = new ConversationGroundingService();
    expect(grounding.selectSufficientChunks({ status: 'ok', correlationId: 'corr', chunks: [] })).toEqual([]);
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
