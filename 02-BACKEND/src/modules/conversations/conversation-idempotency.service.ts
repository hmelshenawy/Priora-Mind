import { Injectable } from '@nestjs/common';
import { ConversationMessageRepository } from './conversation-message.repository';

@Injectable()
export class ConversationIdempotencyService {
  constructor(private readonly messages: ConversationMessageRepository) {}

  async findStoredResult(userId: string, conversationId: string, idempotencyKey: string) {
    const userMessage = await this.messages.findUserMessageByIdempotency(
      userId,
      conversationId,
      idempotencyKey,
    );
    if (!userMessage) return null;
    const assistantMessage = await this.messages.findAssistantForUserMessage(
      userId,
      conversationId,
      userMessage.id,
    );
    if (!assistantMessage) return null;
    return { userMessage, assistantMessage };
  }
}
