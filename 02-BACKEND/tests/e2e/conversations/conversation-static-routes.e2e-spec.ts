import { describe, expect, it, vi } from 'vitest';
import { ConversationMessageService } from '../../../src/modules/conversations/services/conversation-message.service';
import { ConversationRouterService } from '../../../src/modules/conversations/services/conversation-router.service';
import { ConversationSafetyService } from '../../../src/modules/conversations/services/conversation-safety.service';

function makeService() {
  const conversation = {
    id: 'conversation-1',
    userId: 'user-1',
    title: 'Stress tools',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-02T12:00:00Z'),
    updatedAt: new Date('2026-08-02T12:00:00Z'),
    lastMessageAt: null,
  };
  const access = { assertEligible: vi.fn().mockResolvedValue(undefined) };
  const conversations = {
    findOwned: vi.fn().mockResolvedValue(conversation),
    touchAfterMessage: vi.fn().mockResolvedValue(undefined),
  };
  const messages = {
    createUserMessage: vi
      .fn()
      .mockImplementation((_userId, conversationId, content, idempotencyKey) => ({
        id: 'user-message-1',
        conversationId,
        userId: 'user-1',
        role: 'user',
        content,
        route: null,
        status: 'COMPLETED',
        idempotencyKey,
        respondsToMessageId: null,
        createdAt: new Date('2026-08-02T12:00:01Z'),
        updatedAt: new Date('2026-08-02T12:00:01Z'),
        completedAt: new Date('2026-08-02T12:00:01Z'),
      })),
    createAssistantMessage: vi
      .fn()
      .mockImplementation((_userId, conversationId, respondsToMessageId, content, route) => ({
        id: 'assistant-message-1',
        conversationId,
        userId: 'user-1',
        role: 'assistant',
        content,
        route,
        status: 'COMPLETED',
        idempotencyKey: null,
        respondsToMessageId,
        createdAt: new Date('2026-08-02T12:00:02Z'),
        updatedAt: new Date('2026-08-02T12:00:02Z'),
        completedAt: new Date('2026-08-02T12:00:02Z'),
      })),
  };
  const idempotency = { findStoredResult: vi.fn().mockResolvedValue(null) };
  return {
    service: new ConversationMessageService(
      access as never,
      conversations as never,
      messages as never,
      idempotency as never,
      new ConversationRouterService(),
      new ConversationSafetyService(),
    ),
    messages,
  };
}

describe('conversation static/system routes', () => {
  it('handles greeting and thanks without RAG or LLM dependencies', async () => {
    const { service } = makeService();
    await expect(
      service.send('user-1', 'conversation-1', { content: 'hello' }, 'key-1'),
    ).resolves.toMatchObject({
      assistantMessage: { route: 'STATIC_RESPONSE', status: 'COMPLETED', sources: [] },
    });
    await expect(
      service.send('user-1', 'conversation-1', { content: 'thanks' }, 'key-2'),
    ).resolves.toMatchObject({
      assistantMessage: { route: 'STATIC_RESPONSE', status: 'COMPLETED', sources: [] },
    });
  });

  it('handles help and scope as system commands without RAG or LLM dependencies', async () => {
    const { service } = makeService();
    await expect(
      service.send('user-1', 'conversation-1', { content: '/help' }, 'key-1'),
    ).resolves.toMatchObject({
      assistantMessage: { route: 'SYSTEM_COMMAND', status: 'COMPLETED', sources: [] },
    });
    await expect(
      service.send('user-1', 'conversation-1', { content: '/scope' }, 'key-2'),
    ).resolves.toMatchObject({
      assistantMessage: { route: 'SYSTEM_COMMAND', status: 'COMPLETED', sources: [] },
    });
  });
});
