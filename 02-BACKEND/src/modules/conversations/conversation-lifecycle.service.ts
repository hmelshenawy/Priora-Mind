import { Injectable } from '@nestjs/common';
import type {
  CreateConversationInput,
  ListConversationsQuery,
  PatchConversationInput,
} from './conversation.dto';
import { ConversationNotFoundException } from './conversation.errors';
import { presentConversation, presentConversationMessage } from './conversation-presenter';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationMessageRepository } from './conversation-message.repository';
import { ConversationRepository } from './conversation.repository';

@Injectable()
export class ConversationLifecycleService {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly conversations: ConversationRepository,
    private readonly messages: ConversationMessageRepository,
  ) {}

  async create(userId: string, input: CreateConversationInput) {
    await this.access.assertEligible(userId);
    return { conversation: presentConversation(await this.conversations.create(userId, input)) };
  }

  async list(userId: string, query: ListConversationsQuery) {
    await this.access.assertEligible(userId);
    const result = await this.conversations.list(userId, query);
    return { items: result.items.map(presentConversation), nextCursor: result.nextCursor };
  }

  async get(
    userId: string,
    conversationId: string,
    messagesCursor: string | undefined,
    messagesLimit: number,
  ) {
    await this.access.assertEligible(userId);
    const conversation = await this.conversations.findOwned(userId, conversationId);
    if (!conversation) throw new ConversationNotFoundException();
    const messages = await this.messages.listByConversation(
      conversationId,
      messagesCursor,
      messagesLimit,
    );
    return {
      conversation: presentConversation(conversation),
      messages: messages.items.map(presentConversationMessage),
      nextMessagesCursor: messages.nextCursor,
    };
  }

  async patch(userId: string, conversationId: string, input: PatchConversationInput) {
    await this.access.assertEligible(userId);
    const conversation = await this.conversations.setArchived(
      userId,
      conversationId,
      input.archived,
    );
    if (!conversation) throw new ConversationNotFoundException();
    return { conversation: presentConversation(conversation) };
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    await this.access.assertEligible(userId);
    if (!(await this.conversations.deleteOwned(userId, conversationId)))
      throw new ConversationNotFoundException();
  }
}
