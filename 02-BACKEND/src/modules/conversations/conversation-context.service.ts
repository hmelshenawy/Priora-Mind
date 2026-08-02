import { Injectable } from '@nestjs/common';
import type { ConversationHistoryItem } from '../ai/conversation-ai.port';
import { CONVERSATION_LIMITS } from './conversation.constants';
import { ConversationMessageRepository } from './conversation-message.repository';

@Injectable()
export class ConversationContextService {
  constructor(private readonly messages: ConversationMessageRepository) {}

  async loadRecentHistory(userId: string, conversationId: string): Promise<ConversationHistoryItem[]> {
    const rows = await this.messages.findRecentCompletedMessages(
      userId,
      conversationId,
      CONVERSATION_LIMITS.recentHistoryMessages,
    );
    return this.trimToBudget(rows.map((row) => ({ role: row.role, content: row.content })));
  }

  trimToBudget(items: ConversationHistoryItem[]): ConversationHistoryItem[] {
    const kept: ConversationHistoryItem[] = [];
    let remaining = CONVERSATION_LIMITS.recentHistoryMaxChars;
    for (const item of [...items].reverse()) {
      const content = item.content.trim();
      if (!content) continue;
      if (content.length > remaining) break;
      kept.push({ role: item.role, content });
      remaining -= content.length;
    }
    return kept.reverse();
  }
}
