import type {
  ConversationAiPort,
  FollowUpRewriteRequest,
  FollowUpRewriteResult,
  GroundedAnswerRequest,
  GroundedAnswerResult,
} from '../ports/conversation-ai.port';

export class FakeConversationAiAdapter implements ConversationAiPort {
  groundedAnswerCalls = 0;
  rewriteCalls = 0;

  async generateGroundedAnswer(request: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
    this.groundedAnswerCalls += 1;
    const firstChunk = request.chunks[0];
    return {
      content: 'Fixture grounded conversation answer.',
      citations: firstChunk
        ? [
            {
              chunk_id: firstChunk.chunk_id,
              source_id: firstChunk.source_id,
              text_hash: firstChunk.text_hash,
            },
          ]
        : [],
      usage: { prompt: 0, completion: 0, total: 0 },
      latencyMs: 0,
      modelId: 'fake-conversation-ai',
    };
  }

  async rewriteFollowUp(request: FollowUpRewriteRequest): Promise<FollowUpRewriteResult> {
    this.rewriteCalls += 1;
    const lastTopic = [...request.recentHistory]
      .reverse()
      .find((item) => item.content.trim())?.content;
    return {
      standaloneRetrievalQuery: lastTopic
        ? `${request.currentMessage.trim()} about ${lastTopic.trim()}`
        : request.currentMessage.trim(),
      usage: { prompt: 0, completion: 0, total: 0 },
      latencyMs: 0,
      modelId: 'fake-conversation-ai',
    };
  }
}
