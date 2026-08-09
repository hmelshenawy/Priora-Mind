import { describe, expect, it, vi } from 'vitest';
import { ConversationLlmError } from '../../../src/modules/ai/conversation-llm.adapter';
import { FakeConversationAiAdapter } from '../../../src/modules/ai/fake-conversation-ai.adapter';
import { ConversationMessageService } from '../../../src/modules/conversations/conversation-message.service';
import { ConversationRouterService } from '../../../src/modules/conversations/conversation-router.service';
import { ConversationSafetyService } from '../../../src/modules/conversations/conversation-safety.service';
import { FakeConversationRagClient } from '../../helpers/fake-conversation-rag-client';

const conversation = { id: 'c-fail', userId: 'u1', title: null, status: 'ACTIVE' as const, createdAt: new Date(), updatedAt: new Date(), lastMessageAt: null };
const userMessage = { id: 'm-fail', conversationId: 'c-fail', userId: 'u1', role: 'user' as const, content: 'Explain grounding', route: null, status: 'COMPLETED' as const, idempotencyKey: 'k-fail', respondsToMessageId: null, createdAt: new Date(), updatedAt: new Date(), completedAt: new Date() };
const failedAssistant = { id: 'a-fail', conversationId: 'c-fail', userId: 'u1', role: 'assistant' as const, content: "I'm having trouble processing that right now. Please try again in a moment.", route: 'RAG' as const, status: 'FAILED' as const, idempotencyKey: null, respondsToMessageId: 'm-fail', createdAt: new Date(), updatedAt: new Date(), completedAt: new Date(), sources: [] };
const chunk = { chunk_id: 'chunk-1', text: 'Grounding text', score: 0.9, source_id: 'source-1', source_title: 'Source', source_type: 'pdf' as const, chunk_index: 1, text_hash: 'hash-1' };

function makeService(stored: unknown = null, ai = new FakeConversationAiAdapter()) {
  const rag = new FakeConversationRagClient();
  rag.nextSearchResult = { status: 'ok', correlationId: 'corr', chunks: [chunk] };
  const messages = {
    createUserMessage: vi.fn().mockResolvedValue(userMessage),
    findRecentCompletedMessages: vi.fn().mockResolvedValue([]),
    createAssistantMessage: vi.fn().mockResolvedValue(failedAssistant),
    createAssistantFailure: vi.fn().mockResolvedValue(failedAssistant),
  };
  const service = new ConversationMessageService(
    { assertEligible: vi.fn().mockResolvedValue(undefined) } as never,
    { findOwned: vi.fn().mockResolvedValue(conversation), touchAfterMessage: vi.fn().mockResolvedValue(undefined) } as never,
    messages as never,
    { findStoredResult: vi.fn().mockResolvedValue(stored) } as never,
    new ConversationRouterService(),
    new ConversationSafetyService(),
    rag,
    ai,
  );
  return { service, messages, rag };
}

describe('conversation failure and retry e2e', () => {
  it('continues low-risk distress through grounded coaching without assuming self-harm', async () => {
    const ai = new FakeConversationAiAdapter();
    const generate = vi.spyOn(ai, 'generateGroundedAnswer');
    const { service, messages, rag } = makeService(null, ai);
    await service.send('u1', 'c-fail', { content: 'I am feeling depressed' }, 'k-low-risk');
    expect(rag.searchCalls).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(messages.createAssistantFailure).not.toHaveBeenCalled();
    expect(messages.createAssistantMessage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      'RAG', 'COMPLETED', 'LLM', null, null, expect.any(Date), expect.any(Object),
    );
  });

  it('fails closed at SAFETY and does not call RAG or LLM on a technical safety failure', async () => {
    const ai = new FakeConversationAiAdapter();
    const generate = vi.spyOn(ai, 'generateGroundedAnswer');
    const { service, messages, rag } = makeService(null, ai);
    await service.send('u1', 'c-fail', { content: '__safety_check_throw__' }, 'k-safety-failure');
    expect(rag.searchCalls).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
    expect(messages.createAssistantMessage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      'SAFETY', 'FAILED', 'SAFETY', 'SAFETY_UNAVAILABLE', 'safety_check_failed', expect.any(Date),
    );
  });

  it('preserves the approved safety response and bypasses downstream processing for self-harm language', async () => {
    const ai = new FakeConversationAiAdapter();
    const generate = vi.spyOn(ai, 'generateGroundedAnswer');
    const { service, messages, rag } = makeService(null, ai);
    await service.send('u1', 'c-fail', { content: 'I feel suicidal' }, 'k-high-risk');
    expect(rag.searchCalls).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
    expect(messages.createAssistantMessage).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.stringContaining('immediate danger'),
      'SAFETY', 'COMPLETED', 'SAFETY', null, null, expect.any(Date),
    );
  });

  it('persists LLM failures as one safe assistant failure', async () => {
    const ai = new FakeConversationAiAdapter();
    vi.spyOn(ai, 'generateGroundedAnswer').mockRejectedValue(new ConversationLlmError('LLM_TIMEOUT'));
    const { service, messages } = makeService(null, ai);
    const result = await service.send('u1', 'c-fail', { content: 'Explain grounding' }, 'k-fail');
    expect(result.assistantMessage).toMatchObject({ route: 'RAG', status: 'FAILED' });
    expect(messages.createAssistantFailure).toHaveBeenCalledTimes(1);
    expect(messages.createAssistantFailure).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), 'RAG', 'LLM', 'LLM_TIMEOUT', 'llm_failed', expect.any(Date));
  });

  it('persists invalid provider output and unsupported citations as failures', async () => {
    const invalidAi = new FakeConversationAiAdapter();
    vi.spyOn(invalidAi, 'generateGroundedAnswer').mockResolvedValue({ content: '', citations: [], modelId: 'fake' });
    const invalid = makeService(null, invalidAi);
    await invalid.service.send('u1', 'c-fail', { content: 'Explain grounding' }, 'k-invalid');
    expect(invalid.messages.createAssistantFailure).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), 'RAG', 'LLM', 'LLM_INVALID_OUTPUT', 'llm_failed', expect.any(Date));

    const badCitationAi = new FakeConversationAiAdapter();
    vi.spyOn(badCitationAi, 'generateGroundedAnswer').mockResolvedValue({ content: 'Answer', citations: [{ chunk_id: 'missing', source_id: 'source-1', text_hash: 'hash-1' }], modelId: 'fake' });
    const badCitation = makeService(null, badCitationAi);
    await badCitation.service.send('u1', 'c-fail', { content: 'Explain grounding' }, 'k-citation');
    expect(badCitation.messages.createAssistantFailure).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), 'RAG', 'CITATION_VALIDATION', 'LLM_UNSUPPORTED_CITATION', 'citation_validation_failed', expect.any(Date));
  });

  it('replays stored failures without reprocessing or duplicate assistant rows', async () => {
    const { service, messages, rag } = makeService({ userMessage, assistantMessage: failedAssistant });
    const result = await service.send('u1', 'c-fail', { content: 'Explain grounding' }, 'k-fail');
    expect(result.assistantMessage).toMatchObject({ id: 'a-fail', status: 'FAILED' });
    expect(messages.createUserMessage).not.toHaveBeenCalled();
    expect(messages.createAssistantFailure).not.toHaveBeenCalled();
    expect(rag.searchCalls).toHaveLength(0);
  });
});
