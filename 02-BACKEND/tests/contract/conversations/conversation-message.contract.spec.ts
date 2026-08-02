import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { sendConversationMessageSchema } from '../../../src/modules/conversations/conversation.dto';
import { ConversationMessageService } from '../../../src/modules/conversations/conversation-message.service';

describe('conversation send-message contract', () => {
  it('validates content and rejects empty messages', () => {
    expect(sendConversationMessageSchema.safeParse({ content: 'Hello' }).success).toBe(true);
    expect(sendConversationMessageSchema.safeParse({ content: '   ' }).success).toBe(false);
  });

  it('requires X-Idempotency-Key before persistence', async () => {
    const service = new ConversationMessageService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.send('user-1', 'conversation-1', { content: 'Hello' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
