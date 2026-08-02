import { describe, expect, it, vi } from 'vitest';
import { FakeConversationAiAdapter } from '../../../src/modules/ai/fake-conversation-ai.adapter';
import { ConversationMessageService } from '../../../src/modules/conversations/conversation-message.service';
import { ConversationRouterService } from '../../../src/modules/conversations/conversation-router.service';
import { ConversationSafetyService } from '../../../src/modules/conversations/conversation-safety.service';
import { FakeConversationRagClient } from '../../helpers/fake-conversation-rag-client';

const conversation = { id: 'c1', userId: 'u1', title: null, status: 'ACTIVE' as const, createdAt: new Date(), updatedAt: new Date(), lastMessageAt: null };
const userMessage = { id: 'm1', conversationId: 'c1', userId: 'u1', role: 'user' as const, content: 'Explain grounding', route: null, status: 'COMPLETED' as const, idempotencyKey: 'k1', respondsToMessageId: null, createdAt: new Date(), updatedAt: new Date(), completedAt: new Date() };

function makeService(rag: FakeConversationRagClient, ai = new FakeConversationAiAdapter()) {
  const messages = {
    createUserMessage: vi.fn().mockResolvedValue(userMessage),
    findRecentCompletedMessages: vi.fn().mockResolvedValue([]),
    createAssistantMessage: vi.fn((_u, conversationId, respondsToMessageId, content, route, status, processingStage, failureCode, failureDetail, now, options = {}) => Promise.resolve({ id: 'a1', conversationId, userId: 'u1', role: 'assistant' as const, content, route, status, idempotencyKey: null, respondsToMessageId, processingStage, failureCode, failureDetail, createdAt: now, updatedAt: now, completedAt: now, sources: options.sources ?? [] })),
    createAssistantFailure: vi.fn((_u, conversationId, respondsToMessageId, content, route, processingStage, failureCode, failureDetail, now) => Promise.resolve({ id: 'a1', conversationId, userId: 'u1', role: 'assistant' as const, content, route, status: 'FAILED' as const, idempotencyKey: null, respondsToMessageId, processingStage, failureCode, failureDetail, createdAt: now, updatedAt: now, completedAt: now, sources: [] })),
  };
  return {
    service: new ConversationMessageService(
      { assertEligible: vi.fn().mockResolvedValue(undefined) } as never,
      { findOwned: vi.fn().mockResolvedValue(conversation), touchAfterMessage: vi.fn().mockResolvedValue(undefined) } as never,
      messages as never,
      { findStoredResult: vi.fn().mockResolvedValue(null) } as never,
      new ConversationRouterService(),
      new ConversationSafetyService(),
      rag,
      ai,
    ),
    ai,
    messages,
  };
}

describe('conversation insufficient retrieval e2e', () => {
  it('persists empty or weak retrieval as COMPLETED/RAG with empty sources and no LLM call', async () => {
    const rag = new FakeConversationRagClient();
    rag.nextSearchResult = { status: 'ok', correlationId: 'corr', chunks: [] };
    const { service, ai } = makeService(rag);
    const result = await service.send('u1', 'c1', { content: 'Explain grounding' }, 'k1');
    expect(result.assistantMessage).toMatchObject({ route: 'RAG', status: 'COMPLETED', sources: [] });
    expect(result.assistantMessage.content).toContain("don't have enough grounded information");
    expect(ai.groundedAnswerCalls).toBe(0);
  });

  it('persists RAG technical failures as FAILED/RAG with safe fallback', async () => {
    const rag = new FakeConversationRagClient();
    rag.nextSearchResult = { status: 'timeout', correlationId: 'corr', chunks: [], errorCode: 'RAG_TIMEOUT' };
    const { service, messages } = makeService(rag);
    const result = await service.send('u1', 'c1', { content: 'Explain grounding' }, 'k1');
    expect(result.assistantMessage).toMatchObject({ route: 'RAG', status: 'FAILED', content: expect.stringContaining('trouble processing') });
    expect(messages.createAssistantFailure).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), 'RAG', 'RAG', 'RAG_TIMEOUT', 'rag_failed', expect.any(Date));
  });
});
