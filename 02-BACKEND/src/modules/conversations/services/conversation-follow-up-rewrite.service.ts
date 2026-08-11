import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ConversationAiPort, ConversationHistoryItem, FollowUpRewriteResult } from '../../ai/ports/conversation-ai.port';
import { CONVERSATION_AI_PORT } from '../../ai/ports/conversation-ai.port';

export type FollowUpRewriteOutcome =
  | { status: 'ok'; result: FollowUpRewriteResult }
  | { status: 'insufficient_context' }
  | { status: 'failed'; failureCode: string };

@Injectable()
export class ConversationFollowUpRewriteService {
  constructor(@Optional() @Inject(CONVERSATION_AI_PORT) private readonly ai?: ConversationAiPort) {}

  async rewrite(input: {
    correlationId: string;
    recentHistory: ConversationHistoryItem[];
    currentMessage: string;
  }): Promise<FollowUpRewriteOutcome> {
    if (input.recentHistory.length === 0) return { status: 'insufficient_context' };
    if (!this.ai) return { status: 'failed', failureCode: 'FOLLOW_UP_REWRITE_UNAVAILABLE' };
    try {
      const result = await this.ai.rewriteFollowUp(input);
      if (!result.standaloneRetrievalQuery.trim()) {
        return { status: 'failed', failureCode: 'FOLLOW_UP_REWRITE_INVALID_OUTPUT' };
      }
      return { status: 'ok', result };
    } catch {
      return { status: 'failed', failureCode: 'FOLLOW_UP_REWRITE_FAILED' };
    }
  }
}
