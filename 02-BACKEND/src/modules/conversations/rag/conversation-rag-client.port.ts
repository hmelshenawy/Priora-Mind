export const CONVERSATION_RAG_CLIENT_PORT = Symbol('CONVERSATION_RAG_CLIENT_PORT');

export type ConversationRagStatus =
  'ok' | 'insufficient_grounding' | 'unavailable' | 'invalid_response' | 'timeout';

export interface ConversationRagChunk {
  chunk_id: string;
  score: number;
  text: string;
  source_id: string;
  source_title: string;
  source_file?: string | null;
  source_type: 'pdf' | 'markdown';
  chunk_index: number;
  page_number?: number | null;
  page_start?: number | null;
  page_end?: number | null;
  citation_page?: number | null;
  citation_heading?: string | null;
  citation_section?: string | null;
  text_hash: string;
}

export interface ConversationRagSearchRequest {
  question: string;
  limit?: number;
  score_threshold?: number;
}

export interface ConversationRagSearchResult {
  status: ConversationRagStatus;
  correlationId: string;
  chunks: ConversationRagChunk[];
  errorCode?: string;
}

export interface ConversationRagHealthResult {
  status: 'ok' | 'unavailable' | 'unauthorized' | 'invalid_response' | 'timeout';
  correlationId: string;
  collectionName?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
  errorCode?: string;
}

export interface ConversationRagClientPort {
  search(
    request: ConversationRagSearchRequest,
    correlationId: string,
  ): Promise<ConversationRagSearchResult>;
  health(correlationId: string): Promise<ConversationRagHealthResult>;
}
