export type RetrievalStatus = 'ok' | 'unavailable' | 'invalid_response' | 'timeout';

export interface RetrievalSearchRequest {
  question: string;
  limit?: number;
  score_threshold?: number;
}

export interface RetrievedChunk {
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

export interface RetrievalSearchResult {
  status: RetrievalStatus;
  correlationId: string;
  chunks: RetrievedChunk[];
  errorCode?: string;
}
