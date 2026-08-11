import { Injectable } from '@nestjs/common';
import type { ConversationHistoryItem } from '../../ai/ports/conversation-ai.port';
import { CONVERSATION_LIMITS } from '../constants/conversation.constants';
import { ConversationMessageRepository } from '../repositories/conversation-message.repository';

@Injectable()
export class ConversationContextService {
  constructor(private readonly messages: ConversationMessageRepository) {}

  async loadRecentHistory(
    userId: string,
    conversationId: string,
    excludeMessageId?: string,
  ): Promise<ConversationHistoryItem[]> {
    const rows = await this.messages.findRecentCompletedMessages(
      userId,
      conversationId,
      CONVERSATION_LIMITS.recentHistoryMessages,
      excludeMessageId,
    );
    return this.trimToBudget(rows.map((row) => ({ role: row.role, content: row.content })));
  }

  trimToBudget(items: ConversationHistoryItem[]): ConversationHistoryItem[] {
    const kept: ConversationHistoryItem[] = [];
    let remaining = CONVERSATION_LIMITS.recentHistoryMaxChars;
    for (const item of items) {
      const content = item.content.trim();
      if (!content) continue;
      if (content.length > remaining) break;
      kept.push({ role: item.role, content });
      remaining -= content.length;
    }
    return kept.reverse();
  }
}
