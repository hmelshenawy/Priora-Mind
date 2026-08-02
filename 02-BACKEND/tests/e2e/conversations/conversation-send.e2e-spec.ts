import { describe, expect, it, vi } from 'vitest';
import { ConversationArchivedException } from '../../../src/modules/conversations/conversation.errors';
import { ConversationMessageService } from '../../../src/modules/conversations/conversation-message.service';
import { ConversationRouterService } from '../../../src/modules/conversations/conversation-router.service';
import { ConversationSafetyService } from '../../../src/modules/conversations/conversation-safety.service';

const conversation = {
  id: 'conversation-1',
  userId: 'user-1',
  title: 'Stress tools',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-08-02T12:00:00Z'),
  updatedAt: new Date('2026-08-02T12:00:00Z'),
  lastMessageAt: null,
};

const userMessage = {
  id: 'user-message-1',
  conversationId: conversation.id,
  userId: 'user-1',
  role: 'user' as const,
  content: 'Hello',
  route: null,
  status: 'COMPLETED' as const,
  idempotencyKey: 'key-1',
  respondsToMessageId: null,
  createdAt: new Date('2026-08-02T12:00:01Z'),
  updatedAt: new Date('2026-08-02T12:00:01Z'),
  completedAt: new Date('2026-08-02T12:00:01Z'),
};

const assistantMessage = {
  ...userMessage,
  id: 'assistant-message-1',
  role: 'assistant' as const,
  route: 'STATIC_RESPONSE' as const,
  respondsToMessageId: userMessage.id,
  idempotencyKey: null,
};

function makeService(overrides: Partial<{ status: 'ACTIVE' | 'ARCHIVED'; stored: unknown }> = {}) {
  const access = { assertEligible: vi.fn().mockResolvedValue(undefined) };
  const conversations = {
    findOwned: vi.fn().mockResolvedValue({ ...conversation, status: overrides.status ?? 'ACTIVE' }),
    touchAfterMessage: vi.fn().mockResolvedValue(undefined),
  };
  const messages = {
    createUserMessage: vi.fn().mockResolvedValue(userMessage),
    createAssistantMessage: vi.fn().mockResolvedValue(assistantMessage),
  };
  const idempotency = { findStoredResult: vi.fn().mockResolvedValue(overrides.stored ?? null) };
  return {
    service: new ConversationMessageService(
      access as never,
      conversations as never,
      messages as never,
      idempotency as never,
      new ConversationRouterService(),
      new ConversationSafetyService(),
    ),
    conversations,
    messages,
    idempotency,
  };
}

describe('conversation send-message', () => {
  it('persists a user message before a deterministic assistant result and touches conversation timestamps', async () => {
    const { service, messages, conversations } = makeService();
    const result = await service.send('user-1', conversation.id, { content: 'Hello' }, 'key-1');
    expect(result).toMatchObject({
      conversationId: conversation.id,
      userMessage: { id: 'user-message-1', role: 'user', status: 'COMPLETED' },
      assistantMessage: { id: 'assistant-message-1', role: 'assistant', status: 'COMPLETED' },
    });
    expect(messages.createUserMessage).toHaveBeenCalledBefore(messages.createAssistantMessage);
    expect(conversations.touchAfterMessage).toHaveBeenCalled();
  });

  it('replays a stored idempotent result without creating duplicate messages', async () => {
    const { service, messages } = makeService({ stored: { userMessage, assistantMessage } });
    await expect(
      service.send('user-1', conversation.id, { content: 'Hello' }, 'key-1'),
    ).resolves.toMatchObject({
      userMessage: { id: userMessage.id },
      assistantMessage: { id: assistantMessage.id },
    });
    expect(messages.createUserMessage).not.toHaveBeenCalled();
    expect(messages.createAssistantMessage).not.toHaveBeenCalled();
  });

  it('rejects sends to archived conversations', async () => {
    const { service } = makeService({ status: 'ARCHIVED' });
    await expect(
      service.send('user-1', conversation.id, { content: 'Hello' }, 'key-1'),
    ).rejects.toBeInstanceOf(ConversationArchivedException);
  });
});
