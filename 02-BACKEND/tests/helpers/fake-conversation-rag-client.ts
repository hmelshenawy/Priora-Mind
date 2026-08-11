import type {
  RetrievalSearchRequest,
  RetrievalSearchResult,
} from '../../src/modules/retrieval/retrieval.public';

export class FakeConversationRagClient {
  searchCalls: Array<{ request: RetrievalSearchRequest; correlationId: string }> = [];
  nextSearchResult: RetrievalSearchResult = {
    status: 'ok',
    correlationId: 'corr-1',
    chunks: [],
  };
  async search(
    request: RetrievalSearchRequest,
    correlationId: string,
  ): Promise<RetrievalSearchResult> {
    this.searchCalls.push({ request, correlationId });
    return { ...this.nextSearchResult, correlationId };
  }

}
