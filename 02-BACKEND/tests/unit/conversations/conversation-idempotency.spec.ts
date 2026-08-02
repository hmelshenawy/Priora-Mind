import { describe, expect, it, vi } from 'vitest';
import { ConversationIdempotencyService } from '../../../src/modules/conversations/conversation-idempotency.service';

describe('conversation idempotency', () => {
  it('returns a stored user/assistant pair for a final idempotent result', async () => {
    const userMessage = { id: 'user-message-1' };
    const assistantMessage = { id: 'assistant-message-1' };
    const repo = {
      findUserMessageByIdempotency: vi.fn().mockResolvedValue(userMessage),
      findAssistantForUserMessage: vi.fn().mockResolvedValue(assistantMessage),
    };
    const service = new ConversationIdempotencyService(repo as never);
    await expect(service.findStoredResult('user-1', 'conversation-1', 'key-1')).resolves.toEqual({
      userMessage,
      assistantMessage,
    });
    expect(repo.findAssistantForUserMessage).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      'user-message-1',
    );
  });

  it('returns null when the idempotency key has no final assistant result', async () => {
    const repo = {
      findUserMessageByIdempotency: vi.fn().mockResolvedValue({ id: 'user-message-1' }),
      findAssistantForUserMessage: vi.fn().mockResolvedValue(null),
    };
    await expect(
      new ConversationIdempotencyService(repo as never).findStoredResult(
        'user-1',
        'conversation-1',
        'key-1',
      ),
    ).resolves.toBeNull();
  });
});
