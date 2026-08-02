import { describe, expect, it, vi } from 'vitest';
import { ConversationMessageService } from '../../../src/modules/conversations/conversation-message.service';
import { ConversationRouterService } from '../../../src/modules/conversations/conversation-router.service';
import { ConversationSafetyService } from '../../../src/modules/conversations/conversation-safety.service';

function makeService() {
  const access = { assertEligible: vi.fn().mockResolvedValue(undefined) };
  const conversations = {
    findOwned: vi.fn().mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      title: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null,
    }),
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
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
      })),
    createAssistantMessage: vi
      .fn()
      .mockImplementation(
        (
          _userId,
          conversationId,
          respondsToMessageId,
          content,
          route,
          status,
          processingStage,
          failureCode,
        ) => ({
          id: 'assistant-message-1',
          conversationId,
          userId: 'user-1',
          role: 'assistant',
          content,
          route,
          status,
          processingStage,
          failureCode,
          idempotencyKey: null,
          respondsToMessageId,
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: new Date(),
        }),
      ),
  };
  const idempotency = { findStoredResult: vi.fn().mockResolvedValue(null) };
  return new ConversationMessageService(
    access as never,
    conversations as never,
    messages as never,
    idempotency as never,
    new ConversationRouterService(),
    new ConversationSafetyService(),
  );
}

describe('conversation safety route', () => {
  it('routes safety content before static/system/RAG processing', async () => {
    await expect(
      makeService().send('user-1', 'conversation-1', { content: 'I feel suicidal' }, 'key-1'),
    ).resolves.toMatchObject({
      assistantMessage: { route: 'SAFETY', status: 'COMPLETED' },
    });
  });

  it('fails closed on safety technical failure and stops normal processing', async () => {
    await expect(
      makeService().send(
        'user-1',
        'conversation-1',
        { content: '__safety_check_throw__' },
        'key-1',
      ),
    ).resolves.toMatchObject({
      assistantMessage: {
        route: 'SAFETY',
        status: 'FAILED',
        content: expect.stringContaining('immediate danger'),
      },
    });
  });
});
