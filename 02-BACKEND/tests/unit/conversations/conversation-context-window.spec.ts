import { describe, expect, it } from 'vitest';
import { ConversationContextService } from '../../../src/modules/conversations/conversation-context.service';

describe('conversation context window', () => {
  it('keeps bounded recent history without summaries or long-term memory', () => {
    const service = new ConversationContextService({} as never);
    const history = service.trimToBudget(
      Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `message-${index}`,
      })),
    );
    expect(history).toHaveLength(12);
    expect(history.some((item) => item.content.includes('summary'))).toBe(false);
  });
});
