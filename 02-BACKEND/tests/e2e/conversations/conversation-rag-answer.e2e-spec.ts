import { describe, expect, it, vi } from 'vitest';
import { FakeConversationAiAdapter } from '../../../src/modules/ai/services/fake-conversation-ai.adapter';
import { ConversationMessageService } from '../../../src/modules/conversations/services/conversation-message.service';
import { ConversationRouterService } from '../../../src/modules/conversations/services/conversation-router.service';
import { ConversationSafetyService } from '../../../src/modules/conversations/services/conversation-safety.service';
import { FakeConversationRagClient } from '../../helpers/fake-conversation-rag-client';

const conversation = {
  id: 'conversation-rag',
  userId: 'user-1',
  title: 'RAG',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-08-02T12:00:00Z'),
  updatedAt: new Date('2026-08-02T12:00:00Z'),
  lastMessageAt: null,
};

const userMessage = {
  id: 'user-message-rag',
  conversationId: conversation.id,
  userId: 'user-1',
  role: 'user' as const,
  content: 'What is grounding?',
  route: null,
  status: 'COMPLETED' as const,
  idempotencyKey: 'key-rag',
  respondsToMessageId: null,
  createdAt: new Date('2026-08-02T12:00:01Z'),
  updatedAt: new Date('2026-08-02T12:00:01Z'),
  completedAt: new Date('2026-08-02T12:00:01Z'),
};

const chunk = {
  chunk_id: 'chunk-rag-1',
  text: 'Grounding helps people orient to the present moment.',
  score: 0.91,
  source_id: 'source-rag-1',
  source_title: 'Approved Grounding Guide',
  source_file: 'grounding.pdf',
  source_type: 'pdf' as const,
  chunk_index: 2,
  page_number: 4,
  page_start: 4,
  page_end: 5,
  citation_page: 4,
  citation_heading: 'Grounding',
  citation_section: 'Basics',
  text_hash: 'hash-rag-1',
};

describe('conversation RAG answer e2e', () => {
  it('returns a completed RAG answer with persisted citation snapshots matching retrieved chunks', async () => {
    const rag = new FakeConversationRagClient();
    rag.nextSearchResult = { status: 'ok', correlationId: 'corr-1', chunks: [chunk] };
    const ai = new FakeConversationAiAdapter();
    const messages = {
      createUserMessage: vi.fn().mockResolvedValue(userMessage),
      createAssistantMessage: vi.fn((_userId, conversationId, respondsToMessageId, content, route, status, processingStage, _failureCode, _failureDetail, now, options) =>
        Promise.resolve({
          id: 'assistant-message-rag',
          conversationId,
          userId: 'user-1',
          role: 'assistant' as const,
          content,
          route,
          status,
          idempotencyKey: null,
          respondsToMessageId,
          processingStage,
          createdAt: now,
          updatedAt: now,
          completedAt: now,
          sources: options.sources,
        }),
      ),
      findRecentCompletedMessages: vi.fn().mockResolvedValue([]),
    };
    const service = new ConversationMessageService(
      { assertEligible: vi.fn().mockResolvedValue(undefined) } as never,
      {
        findOwned: vi.fn().mockResolvedValue(conversation),
        touchAfterMessage: vi.fn().mockResolvedValue(undefined),
      } as never,
      messages as never,
      { findStoredResult: vi.fn().mockResolvedValue(null) } as never,
      new ConversationRouterService(),
      new ConversationSafetyService(),
      rag,
      ai,
    );

    const result = await service.send('user-1', conversation.id, { content: 'What is grounding?' }, 'key-rag');
    expect(result.assistantMessage).toMatchObject({ route: 'RAG', status: 'COMPLETED', content: 'Fixture grounded conversation answer.' });
    expect(result.assistantMessage.sources).toEqual([
      expect.objectContaining({ chunkId: 'chunk-rag-1', sourceId: 'source-rag-1', textHash: 'hash-rag-1' }),
    ]);
    expect(rag.searchCalls[0].request).toMatchObject({ question: 'What is grounding?', limit: 6, score_threshold: 0.44 });
    expect(ai.groundedAnswerCalls).toBe(1);
  });
});
