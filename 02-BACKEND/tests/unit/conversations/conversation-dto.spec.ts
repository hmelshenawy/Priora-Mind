import { describe, expect, it } from 'vitest';
import {
  createConversationSchema,
  listConversationsQuerySchema,
  patchConversationSchema,
  sendConversationMessageSchema,
} from '../../../src/modules/conversations/conversation.dto';

describe('conversation DTO validation foundation', () => {
  it('trims title and content and rejects empty values', () => {
    expect(createConversationSchema.parse({ title: '  Stress tools  ' })).toEqual({
      title: 'Stress tools',
    });
    expect(createConversationSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(sendConversationMessageSchema.parse({ content: '  Hello  ' })).toEqual({
      content: 'Hello',
    });
    expect(sendConversationMessageSchema.safeParse({ content: '   ' }).success).toBe(false);
  });

  it('rejects unknown fields and invalid lifecycle actions', () => {
    expect(createConversationSchema.safeParse({ title: 'Stress', userId: 'user-1' }).success).toBe(
      false,
    );
    expect(patchConversationSchema.safeParse({ archived: true, title: 'Deferred' }).success).toBe(
      false,
    );
  });

  it('coerces bounded pagination values', () => {
    expect(
      listConversationsQuerySchema.parse({ limit: '25', includeArchived: 'false' }),
    ).toMatchObject({
      limit: 25,
      includeArchived: false,
    });
    expect(listConversationsQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });
});
