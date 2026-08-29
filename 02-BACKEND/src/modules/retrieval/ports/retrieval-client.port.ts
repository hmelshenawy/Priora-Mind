import type { RetrievalSearchRequest, RetrievalSearchResult } from '../dto/retrieval.dto';

export const RETRIEVAL_CLIENT_PORT = Symbol('RETRIEVAL_CLIENT_PORT');

export interface RetrievalClientPort {
  search(request: RetrievalSearchRequest, correlationId: string): Promise<RetrievalSearchResult>;
}
