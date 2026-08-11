import { Injectable } from '@nestjs/common';
import type { ConversationHistoryItem } from '../../ai/ports/conversation-ai.port';
import type { ConversationRagChunk } from '../rag/conversation-rag-client.port';
import { CONVERSATION_SYSTEM_INSTRUCTIONS } from '../constants/conversation-system.prompt';

export interface ConversationGroundedPrompt {
  productInstructions: string[];
  recentHistory: ConversationHistoryItem[];
  currentMessage: string;
  standaloneRetrievalQuery: string;
  chunks: ConversationRagChunk[];
}

@Injectable()
export class ConversationPromptBuilder {
  build(input: {
    recentHistory: ConversationHistoryItem[];
    currentMessage: string;
    standaloneRetrievalQuery: string;
    chunks: ConversationRagChunk[];
  }): ConversationGroundedPrompt {
    return {
      productInstructions: [...CONVERSATION_SYSTEM_INSTRUCTIONS],
      recentHistory: input.recentHistory,
      currentMessage: input.currentMessage,
      standaloneRetrievalQuery: input.standaloneRetrievalQuery,
      chunks: input.chunks,
    };
  }
}
