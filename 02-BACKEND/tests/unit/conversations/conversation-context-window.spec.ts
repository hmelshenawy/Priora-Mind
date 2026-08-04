import { describe, expect, it, vi } from 'vitest';
import { ConversationContextService } from '../../../src/modules/conversations/conversation-context.service';

describe('conversation context window', () => {
  it('converts newest-first repository rows into chronological history', () => {
    const service = new ConversationContextService({} as never);
    const history = service.trimToBudget(
      [
        { role: 'assistant', content: 'newest' },
        { role: 'user', content: 'middle' },
        { role: 'assistant', content: 'oldest' },
      ],
    );
    expect(history.map((item) => item.content)).toEqual(['oldest', 'middle', 'newest']);
    expect(history.some((item) => item.content.includes('summary'))).toBe(false);
  });

  it('excludes the separately supplied current user message', async () => {
    const messages = { findRecentCompletedMessages: vi.fn().mockResolvedValue([]) };
    const service = new ConversationContextService(messages as never);
    await service.loadRecentHistory('user-1', 'conversation-1', 'current-message');
    expect(messages.findRecentCompletedMessages).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      10,
      'current-message',
    );
  });
});
