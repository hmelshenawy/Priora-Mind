import { Inject, Injectable } from '@nestjs/common';
import type { RetrievalSearchRequest, RetrievalSearchResult } from '../dto/retrieval.dto';
import { RETRIEVAL_CLIENT_PORT, type RetrievalClientPort } from '../ports/retrieval-client.port';

@Injectable()
export class RetrievalService {
  constructor(@Inject(RETRIEVAL_CLIENT_PORT) private readonly client: RetrievalClientPort) {}

  search(request: RetrievalSearchRequest, correlationId: string): Promise<RetrievalSearchResult> {
    return this.client.search(request, correlationId);
  }
}
