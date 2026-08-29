import { describe, expect, it, vi } from 'vitest';
import { FakeConversationAiAdapter } from '../../../src/modules/ai/services/fake-conversation-ai.adapter';
import { ConversationMessageService } from '../../../src/modules/conversations/services/conversation-message.service';
import { ConversationRouterService } from '../../../src/modules/conversations/services/conversation-router.service';
import { ConversationSafetyService } from '../../../src/modules/conversations/services/conversation-safety.service';
import { FakeConversationRagClient } from '../../helpers/fake-conversation-rag-client';

const conversation = {
  id: 'conversation-follow-up',
  userId: 'user-1',
  title: 'Follow up',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-08-02T12:00:00Z'),
  updatedAt: new Date('2026-08-02T12:00:00Z'),
  lastMessageAt: null,
};

const chunk = {
  chunk_id: 'chunk-follow-1',
  text: 'Paced breathing can support calming.',
  score: 0.91,
  source_id: 'source-follow-1',
  source_title: 'Approved Breathing Guide',
  source_type: 'pdf' as const,
  chunk_index: 1,
  text_hash: 'hash-follow-1',
};

function makeService(overrides: { history?: Array<{ role: 'user' | 'assistant'; content: string }>; ai?: FakeConversationAiAdapter } = {}) {
  const rag = new FakeConversationRagClient();
  rag.nextSearchResult = { status: 'ok', correlationId: 'corr-1', chunks: [chunk] };
  const ai = overrides.ai ?? new FakeConversationAiAdapter();
  let assistantIndex = 0;
  const messages = {
    createUserMessage: vi.fn().mockResolvedValue({
      id: 'user-message-follow',
      conversationId: conversation.id,
      userId: 'user-1',
      role: 'user' as const,
      content: 'Why?',
      route: null,
      status: 'COMPLETED' as const,
      idempotencyKey: 'key-follow',
      respondsToMessageId: null,
      createdAt: new Date('2026-08-02T12:00:01Z'),
      updatedAt: new Date('2026-08-02T12:00:01Z'),
      completedAt: new Date('2026-08-02T12:00:01Z'),
    }),
    createAssistantMessage: vi.fn((_userId, conversationId, respondsToMessageId, content, route, status, processingStage, failureCode, failureDetail, now, options = {}) =>
      Promise.resolve({
        id: `assistant-message-follow-${++assistantIndex}`,
        conversationId,
        userId: 'user-1',
        role: 'assistant' as const,
        content,
        route,
        status,
        idempotencyKey: null,
        respondsToMessageId,
        processingStage,
        failureCode,
        failureDetail,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
        sources: options.sources ?? [],
      }),
    ),
    findRecentCompletedMessages: vi.fn().mockResolvedValue(overrides.history ?? []),
  };
  const service = new ConversationMessageService(
    { assertEligible: vi.fn().mockResolvedValue(undefined) } as never,
    { findOwned: vi.fn().mockResolvedValue(conversation), touchAfterMessage: vi.fn().mockResolvedValue(undefined) } as never,
    messages as never,
    { findStoredResult: vi.fn().mockResolvedValue(null) } as never,
    new ConversationRouterService(),
    new ConversationSafetyService(),
    rag,
    ai,
  );
  return { service, rag, ai, messages };
}

describe('conversation follow-up e2e', () => {
  it('rewrites dependent messages, stores standalone query metadata, and then uses RAG', async () => {
    const { service, rag, ai, messages } = makeService({ history: [{ role: 'assistant', content: 'paced breathing' }] });
    const result = await service.send('user-1', conversation.id, { content: 'Why?' }, 'key-follow');
    expect(result.assistantMessage).toMatchObject({ route: 'RAG', status: 'COMPLETED' });
    expect(ai.rewriteCalls).toBe(1);
    expect(rag.searchCalls[0].request.question).toContain('paced breathing');
    expect(messages.createAssistantMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'RAG',
      'COMPLETED',
      'LLM',
      null,
      null,
      expect.any(Date),
      expect.objectContaining({ standaloneRetrievalQuery: expect.stringContaining('paced breathing') }),
    );
  });

  it('does not rewrite clear messages', async () => {
    const { service, ai, rag } = makeService({ history: [{ role: 'assistant', content: 'paced breathing' }] });
    await service.send('user-1', conversation.id, { content: 'What is a grounding exercise for stress?' }, 'key-clear');
    expect(ai.rewriteCalls).toBe(0);
    expect(rag.searchCalls[0].request.question).toBe('What is a grounding exercise for stress?');
  });

  it('returns insufficient-context clarification without calling RAG', async () => {
    const { service, rag, messages } = makeService({ history: [] });
    const result = await service.send('user-1', conversation.id, { content: 'Why?' }, 'key-insufficient');
    expect(result.assistantMessage).toMatchObject({ route: 'RAG', status: 'COMPLETED' });
    expect(rag.searchCalls).toHaveLength(0);
    expect(messages.createAssistantMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'RAG',
      'COMPLETED',
      'FOLLOW_UP_REWRITE',
      null,
      null,
      expect.any(Date),
      expect.objectContaining({ reason: 'INSUFFICIENT_CONTEXT' }),
    );
  });

  it('persists rewrite technical failure without calling RAG', async () => {
    const ai = new FakeConversationAiAdapter();
    vi.spyOn(ai, 'rewriteFollowUp').mockRejectedValue(new Error('provider down'));
    const { service, rag, messages } = makeService({ history: [{ role: 'assistant', content: 'paced breathing' }], ai });
    const result = await service.send('user-1', conversation.id, { content: 'Why?' }, 'key-failed');
    expect(result.assistantMessage).toMatchObject({ route: 'RAG', status: 'FAILED' });
    expect(rag.searchCalls).toHaveLength(0);
    expect(messages.createAssistantMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'RAG',
      'FAILED',
      'FOLLOW_UP_REWRITE',
      'FOLLOW_UP_REWRITE_FAILED',
      'follow_up_rewrite_failed',
      expect.any(Date),
    );
  });
});
