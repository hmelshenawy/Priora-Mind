export const CONVERSATION_AI_PORT = Symbol('CONVERSATION_AI_PORT');

export interface GroundedChunk {
  chunk_id: string;
  source_id: string;
  text_hash: string;
  text: string;
}

export interface ConversationHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface GroundedAnswerRequest {
  correlationId: string;
  productInstructions: string[];
  recentHistory: ConversationHistoryItem[];
  currentMessage: string;
  standaloneRetrievalQuery: string;
  chunks: GroundedChunk[];
}

export interface GroundedAnswerResult {
  content: string;
  citations: Array<{ chunk_id: string; source_id: string; text_hash: string }>;
  usage?: { prompt?: number; completion?: number; total?: number };
  latencyMs?: number;
  modelId: string;
}

export interface FollowUpRewriteRequest {
  correlationId: string;
  recentHistory: ConversationHistoryItem[];
  currentMessage: string;
}

export interface FollowUpRewriteResult {
  standaloneRetrievalQuery: string;
  usage?: { prompt?: number; completion?: number; total?: number };
  latencyMs?: number;
  modelId: string;
}

export interface ConversationAiPort {
  generateGroundedAnswer(request: GroundedAnswerRequest): Promise<GroundedAnswerResult>;
  rewriteFollowUp(request: FollowUpRewriteRequest): Promise<FollowUpRewriteResult>;
}
