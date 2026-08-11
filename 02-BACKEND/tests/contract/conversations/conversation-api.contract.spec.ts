import { describe, expect, it } from 'vitest';
import {
  createConversationSchema,
  getConversationQuerySchema,
  listConversationsQuerySchema,
  patchConversationSchema,
  sendConversationMessageSchema,
} from '../../../src/modules/conversations/dto/conversation.dto';

describe('conversation API contract foundation', () => {
  it('rejects client-supplied user ids in create payloads', () => {
    expect(
      createConversationSchema.safeParse({ title: 'Stress tools', userId: 'user-1' }).success,
    ).toBe(false);
  });

  it('validates lifecycle and send-message MVP request shapes', () => {
    expect(
      listConversationsQuerySchema.parse({ includeArchived: 'true', limit: '10' }),
    ).toMatchObject({ includeArchived: true, limit: 10 });
    expect(getConversationQuerySchema.parse({ messagesLimit: '10' })).toMatchObject({
      messagesLimit: 10,
    });
    expect(patchConversationSchema.safeParse({ archived: true }).success).toBe(true);
    expect(sendConversationMessageSchema.safeParse({ content: 'What is grounding?' }).success).toBe(
      true,
    );
  });
});
