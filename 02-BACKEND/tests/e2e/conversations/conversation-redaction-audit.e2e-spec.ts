import { describe, expect, it, vi } from 'vitest';
import { ConversationLlmError } from '../../../src/modules/ai/ai.public';
import { FakeConversationAiAdapter } from '../../../src/modules/ai/services/fake-conversation-ai.adapter';
import { ConversationMessageService } from '../../../src/modules/conversations/services/conversation-message.service';
import { ConversationRouterService } from '../../../src/modules/conversations/services/conversation-router.service';
import { ConversationSafetyService } from '../../../src/modules/conversations/services/conversation-safety.service';
import { FakeConversationRagClient } from '../../helpers/fake-conversation-rag-client';

describe('conversation redaction audit', () => {
  it('does not persist raw message, retrieved text, prompts, provider secrets, or stack traces in failure metadata', async () => {
    const rawMessage = 'my private panic details';
    const rawRetrievedText = 'retrieved sensitive chunk text';
    const secret = 'sk-live-secret';
    const rag = new FakeConversationRagClient();
    rag.nextSearchResult = {
      status: 'ok',
      correlationId: 'corr',
      chunks: [{ chunk_id: 'chunk', text: rawRetrievedText, score: 0.9, source_id: 'source', source_title: 'Source', source_type: 'pdf', chunk_index: 1, text_hash: 'hash' }],
    };
    const ai = new FakeConversationAiAdapter();
    vi.spyOn(ai, 'generateGroundedAnswer').mockRejectedValue(new ConversationLlmError('LLM_UNAVAILABLE'));
    const failureArgs: unknown[][] = [];
    const messages = {
      createUserMessage: vi.fn().mockResolvedValue({ id: 'user-message', conversationId: 'conversation', userId: 'user', role: 'user', content: rawMessage, route: null, status: 'COMPLETED', idempotencyKey: 'key', respondsToMessageId: null, createdAt: new Date(), updatedAt: new Date(), completedAt: new Date() }),
      findRecentCompletedMessages: vi.fn().mockResolvedValue([]),
      createAssistantFailure: vi.fn((...args) => {
        failureArgs.push(args);
        return Promise.resolve({ id: 'assistant', conversationId: 'conversation', userId: 'user', role: 'assistant', content: args[3], route: args[4], status: 'FAILED', idempotencyKey: null, respondsToMessageId: 'user-message', processingStage: args[5], failureCode: args[6], failureDetail: args[7], createdAt: args[8], updatedAt: args[8], completedAt: args[8], sources: [] });
      }),
    };
    const service = new ConversationMessageService(
      { assertEligible: vi.fn().mockResolvedValue(undefined) } as never,
      { findOwned: vi.fn().mockResolvedValue({ id: 'conversation', userId: 'user', status: 'ACTIVE' }), touchAfterMessage: vi.fn().mockResolvedValue(undefined) } as never,
      messages as never,
      { findStoredResult: vi.fn().mockResolvedValue(null) } as never,
      new ConversationRouterService(),
      new ConversationSafetyService(),
      rag,
      ai,
    );

    await service.send('user', 'conversation', { content: rawMessage }, 'key');
    const serialized = JSON.stringify(failureArgs);
    expect(serialized).not.toContain(rawMessage);
    expect(serialized).not.toContain(rawRetrievedText);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('prompt');
    expect(serialized).toContain('LLM_UNAVAILABLE');
  });
});
