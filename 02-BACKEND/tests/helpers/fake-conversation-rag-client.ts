import type {
  ConversationRagClientPort,
  ConversationRagHealthResult,
  ConversationRagSearchRequest,
  ConversationRagSearchResult,
} from '../../src/modules/conversations/rag/conversation-rag-client.port';

export class FakeConversationRagClient implements ConversationRagClientPort {
  searchCalls: Array<{ request: ConversationRagSearchRequest; correlationId: string }> = [];
  healthCalls: string[] = [];
  nextSearchResult: ConversationRagSearchResult = {
    status: 'ok',
    correlationId: 'corr-1',
    chunks: [],
  };
  nextHealthResult: ConversationRagHealthResult = { status: 'ok', correlationId: 'corr-1' };

  async search(
    request: ConversationRagSearchRequest,
    correlationId: string,
  ): Promise<ConversationRagSearchResult> {
    this.searchCalls.push({ request, correlationId });
    return { ...this.nextSearchResult, correlationId };
  }

  async health(correlationId: string): Promise<ConversationRagHealthResult> {
    this.healthCalls.push(correlationId);
    return { ...this.nextHealthResult, correlationId };
  }
}
