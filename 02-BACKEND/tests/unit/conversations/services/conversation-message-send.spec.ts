/**
 * Characterization tests for `ConversationMessageService.send()`.
 *
 * Purpose: lock down the CURRENT behavior of the conversation send pipeline at
 * the unit level before `conversation-message.service.ts` is refactored. These
 * tests are the safety net for the upcoming Conversation Module refactor — they
 * must keep passing, byte-for-byte, through every behavior-preserving move/split.
 *
 * What is characterized (observable behavior + collaborator interactions, NOT
 * private method names):
 *   - idempotent replay
 *   - the full normal RAG → grounding → LLM → citation success path
 *   - safety hold, safety technical failure
 *   - static / system-command routing
 *   - follow-up rewrite success / insufficient-context / technical failure
 *   - RAG unavailable (unconfigured) and RAG search failure (unavailable/timeout/invalid)
 *   - insufficient retrieval evidence
 *   - LLM failure (provider throw, invalid output, unsafe output, unconfigured)
 *   - citation validation/mapping failure
 *   - successful-completion persisted metadata
 *   - ordering: Safety before RAG, RAG before LLM, validation before success persistence
 *
 * The service instantiates several collaborators itself (follow-up detector,
 * context service, follow-up rewrite service, grounding, prompt builder, citation
 * mapper) from the `messages` repository and `ai` port we pass in. We therefore use
 * the REAL idempotency / router / safety / context / grounding / citation services
 * (built on fakes for `access`, `conversations` repo, `messages` repo, `rag`, `ai`)
 * so the tests characterize the real end-to-end wiring of `send()`.
 *
 * No production behavior is changed by this file.
 */

import { describe, expect, it, vi } from 'vitest';
import { ConversationMessageService } from '../../../../src/modules/conversations/services/conversation-message.service';
import { ConversationIdempotencyService } from '../../../../src/modules/conversations/services/conversation-idempotency.service';
import { ConversationRouterService } from '../../../../src/modules/conversations/services/conversation-router.service';
import { ConversationSafetyService } from '../../../../src/modules/conversations/services/conversation-safety.service';
import { CONVERSATION_FALLBACKS } from '../../../../src/modules/conversations/constants/conversation.constants';
import { buildInsufficientEvidenceResponse } from '../../../../src/modules/conversations/utils/conversation-insufficient-evidence';
import { SAFETY_COPY } from '../../../../src/modules/safety/constants/safety-definition';
import { FakeConversationAiAdapter } from '../../../../src/modules/ai/services/fake-conversation-ai.adapter';
import { ConversationLlmError } from '../../../../src/modules/ai/ai.public';
import type {
  ConversationAiPort,
  FollowUpRewriteRequest,
  FollowUpRewriteResult,
  GroundedAnswerRequest,
  GroundedAnswerResult,
} from '../../../../src/modules/ai/ai.public';
import type {
  RetrievalSearchResult,
} from '../../../../src/modules/retrieval/retrieval.public';

const USER_ID = 'user-1';
const CONVERSATION_ID = 'conversation-1';
const IDEMPOTENCY_KEY = 'key-1';

const conversationRow = {
  id: CONVERSATION_ID,
  userId: USER_ID,
  title: 'Stress tools',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-08-02T12:00:00Z'),
  updatedAt: new Date('2026-08-02T12:00:00Z'),
  lastMessageAt: null,
};

const validChunk = {
  chunk_id: 'chunk-1',
  text: 'Approved grounding content about paced breathing for anxiety.',
  score: 0.9,
  source_id: 'source-1',
  source_title: 'Approved Source',
  source_type: 'pdf' as const,
  chunk_index: 1,
  text_hash: 'hash-1',
  source_file: 'approved.pdf',
  citation_page: 4,
  page_start: 4,
  page_end: 5,
  citation_heading: 'Grounding',
  citation_section: 'paced-breathing',
};

const okRagResult: RetrievalSearchResult = {
  status: 'ok',
  correlationId: 'corr',
  chunks: [validChunk],
};

type AssistantRow = {
  id: string;
  conversationId: string;
  userId: string;
  role: 'assistant';
  content: string;
  route: string | null;
  status: string;
  respondsToMessageId: string | null;
  processingStage: string | null;
  failureCode: string | null;
  failureDetail: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date;
  sources: unknown[];
};

type MessagesFake = {
  createUserMessage: ReturnType<typeof vi.fn>;
  createAssistantMessage: ReturnType<typeof vi.fn>;
  createAssistantFailure: ReturnType<typeof vi.fn>;
  findRecentCompletedMessages: ReturnType<typeof vi.fn>;
  findUserMessageByIdempotency: ReturnType<typeof vi.fn>;
  findAssistantForUserMessage: ReturnType<typeof vi.fn>;
};

function makeMessages(opts: {
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  stored?: { userMessage: Record<string, unknown>; assistantMessage: Record<string, unknown> } | null;
} = {}): MessagesFake {
  const createUserMessage = vi.fn(
    async (userId: string, conversationId: string, content: string, idempotencyKey: string, now: Date) => ({
      id: 'user-msg-1',
      conversationId,
      userId,
      role: 'user' as const,
      content,
      route: null,
      status: 'COMPLETED' as const,
      idempotencyKey,
      respondsToMessageId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      sources: [],
    }),
  );
  const createAssistantMessage = vi.fn(
    async (
      userId: string,
      conversationId: string,
      respondsToMessageId: string,
      content: string,
      route: string,
      status: string,
      processingStage: string | null,
      failureCode: string | null,
      failureDetail: string | null,
      now: Date,
      options: Record<string, unknown> = {},
    ): Promise<AssistantRow> => ({
      id: 'assistant-msg-1',
      conversationId,
      userId,
      role: 'assistant' as const,
      content,
      route,
      status,
      respondsToMessageId,
      processingStage,
      failureCode,
      failureDetail,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      sources: (options.sources as unknown[]) ?? [],
    }),
  );
  const createAssistantFailure = vi.fn(
    async (
      userId: string,
      conversationId: string,
      respondsToMessageId: string,
      content: string,
      route: string,
      processingStage: string,
      failureCode: string,
      failureDetail: string,
      now: Date,
    ): Promise<AssistantRow> => ({
      id: 'assistant-fail-1',
      conversationId,
      userId,
      role: 'assistant' as const,
      content,
      route,
      status: 'FAILED',
      respondsToMessageId,
      processingStage,
      failureCode,
      failureDetail,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      sources: [],
    }),
  );
  const findRecentCompletedMessages = vi.fn(async () => opts.recentHistory ?? []);
  const stored = opts.stored;
  const findUserMessageByIdempotency = vi.fn(async () => stored?.userMessage ?? null);
  const findAssistantForUserMessage = vi.fn(async () => stored?.assistantMessage ?? null);
  return {
    createUserMessage,
    createAssistantMessage,
    createAssistantFailure,
    findRecentCompletedMessages,
    findUserMessageByIdempotency,
    findAssistantForUserMessage,
  };
}

type RagFake = {
  search: ReturnType<typeof vi.fn>;
  health: ReturnType<typeof vi.fn>;
};

function makeRag(result: RetrievalSearchResult = okRagResult): RagFake {
  return {
    search: vi.fn(async () => result),
    health: vi.fn(async () => ({ status: 'ok', correlationId: 'corr' })),
  };
}

type SpiedAi = ConversationAiPort & {
  generateGroundedAnswer: ReturnType<typeof vi.fn>;
  rewriteFollowUp: ReturnType<typeof vi.fn>;
};

/** Wraps FakeConversationAiAdapter with vi.fn spies (defaults to its success behavior)
 * so tests can both assert call counts/ordering and override outcomes per test. */
function spiedAi(
  overrides: {
    grounded?: (req: GroundedAnswerRequest) => GroundedAnswerResult | Promise<GroundedAnswerResult>;
    rewrite?: (req: FollowUpRewriteRequest) => FollowUpRewriteResult | Promise<FollowUpRewriteResult>;
  } = {},
): SpiedAi {
  const fake = new FakeConversationAiAdapter();
  return {
    generateGroundedAnswer: vi.fn(
      overrides.grounded ?? ((req: GroundedAnswerRequest) => fake.generateGroundedAnswer(req)),
    ),
    rewriteFollowUp: vi.fn(
      overrides.rewrite ?? ((req: FollowUpRewriteRequest) => fake.rewriteFollowUp(req)),
    ),
  } as unknown as SpiedAi;
}

type BuildOptions = {
  conversationStatus?: 'ACTIVE' | 'ARCHIVED';
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  stored?: { userMessage: Record<string, unknown>; assistantMessage: Record<string, unknown> } | null;
  rag?: RagFake | null;
  ai?: SpiedAi | null;
};

function build(opts: BuildOptions = {}) {
  const access = { assertEligible: vi.fn(async () => undefined) };
  const conversations = {
    findOwned: vi.fn(async () => ({ ...conversationRow, status: opts.conversationStatus ?? 'ACTIVE' })),
    touchAfterMessage: vi.fn(async () => undefined),
  };
  const messages = makeMessages({ recentHistory: opts.recentHistory, stored: opts.stored });
  const idempotency = new ConversationIdempotencyService(messages as never);
  const service = new ConversationMessageService(
    access as never,
    conversations as never,
    messages as never,
    idempotency,
    new ConversationRouterService(),
    new ConversationSafetyService(),
    (opts.rag === undefined ? makeRag() : opts.rag) as never,
    (opts.ai === undefined ? spiedAi() : opts.ai) as never,
  );
  return { service, access, conversations, messages, idempotency };
}

function assistantCreateArgs(messages: MessagesFake) {
  return messages.createAssistantMessage.mock.calls.at(-1) ?? [];
}
function assistantFailureArgs(messages: MessagesFake) {
  return messages.createAssistantFailure.mock.calls.at(-1) ?? [];
}

const storedUserRow = {
  id: 'stored-user-1',
  conversationId: CONVERSATION_ID,
  userId: USER_ID,
  role: 'user',
  content: 'Hello',
  route: null,
  status: 'COMPLETED',
  idempotencyKey: IDEMPOTENCY_KEY,
  createdAt: new Date('2026-08-02T12:00:01Z'),
  updatedAt: new Date('2026-08-02T12:00:01Z'),
  completedAt: new Date('2026-08-02T12:00:01Z'),
  sources: [],
};
const storedAssistantRow = {
  id: 'stored-assistant-1',
  conversationId: CONVERSATION_ID,
  userId: USER_ID,
  role: 'assistant',
  content: 'Hi there.',
  route: 'STATIC_RESPONSE',
  status: 'COMPLETED',
  respondsToMessageId: 'stored-user-1',
  createdAt: new Date('2026-08-02T12:00:02Z'),
  updatedAt: new Date('2026-08-02T12:00:02Z'),
  completedAt: new Date('2026-08-02T12:00:02Z'),
  sources: [],
};

describe('ConversationMessageService.send() — characterization', () => {
  // ── 1. Idempotent replay ───────────────────────────────────────────────
  describe('idempotent replay', () => {
    it('returns the stored completed result without re-running downstream processing', async () => {
      const rag = makeRag();
      const ai = spiedAi();
      const { service, conversations, messages } = build({
        stored: { userMessage: storedUserRow, assistantMessage: storedAssistantRow },
        rag,
        ai,
      });

      const result = await service.send(USER_ID, CONVERSATION_ID, { content: 'Hello' }, IDEMPOTENCY_KEY);

      expect(result).toMatchObject({
        conversationId: CONVERSATION_ID,
        userMessage: { id: 'stored-user-1', role: 'user' },
        assistantMessage: { id: 'stored-assistant-1', role: 'assistant' },
      });
      // no duplicate persistence
      expect(messages.createUserMessage).not.toHaveBeenCalled();
      expect(messages.createAssistantMessage).not.toHaveBeenCalled();
      expect(messages.createAssistantFailure).not.toHaveBeenCalled();
      // no downstream Safety/RAG/LLM work
      expect(rag.search).not.toHaveBeenCalled();
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
      expect(ai.rewriteFollowUp).not.toHaveBeenCalled();
      // replay does not touch conversation activity
      expect(conversations.touchAfterMessage).not.toHaveBeenCalled();
    });
  });

  // ── 2 + 13. Normal successful RAG path + successful-completion metadata ─
  describe('normal successful RAG path', () => {
    it('runs Safety → RAG → grounding → LLM → citation mapping and persists a completed assistant message with full metadata', async () => {
      const rag = makeRag();
      const ai = spiedAi();
      const { service, conversations, messages } = build({ rag, ai });

      const result = await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

      // user message persisted first
      expect(messages.createUserMessage).toHaveBeenCalledTimes(1);
      // RAG ran and produced chunks
      expect(rag.search).toHaveBeenCalledTimes(1);
      // LLM ran after RAG
      expect(ai.generateGroundedAnswer).toHaveBeenCalledTimes(1);
      // exactly one assistant message persisted, no failure persisted
      expect(messages.createAssistantMessage).toHaveBeenCalledTimes(1);
      expect(messages.createAssistantFailure).not.toHaveBeenCalled();

      const args = assistantCreateArgs(messages);
      expect(args[4]).toBe('RAG'); // route
      expect(args[5]).toBe('COMPLETED'); // status
      expect(args[6]).toBe('LLM'); // processingStage
      expect(args[7]).toBeNull(); // failureCode
      expect(args[8]).toBeNull(); // failureDetail
      const options = (args[10] ?? {}) as Record<string, unknown>;
      expect(options.provider).toBe('conversation-ai');
      expect(options.modelId).toBe('fake-conversation-ai');
      expect(options.tokenUsage).toMatchObject({ total: 0 });
      expect(options.latencyMs).toBe(0);
      expect(options.standaloneRetrievalQuery).toBeNull(); // non-follow-up
      const sources = options.sources as Array<{ chunkId: string; textHash: string; displayOrder: number }>;
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        chunkId: 'chunk-1',
        sourceId: 'source-1',
        textHash: 'hash-1',
        displayOrder: 1,
      });

      // returned DTOs
      expect(result).toMatchObject({
        conversationId: CONVERSATION_ID,
        userMessage: { role: 'user', status: 'COMPLETED' },
        assistantMessage: { role: 'assistant', status: 'COMPLETED', route: 'RAG' },
      });

      // conversation activity updated
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);

      // ordering / interaction boundaries
      expect(messages.createUserMessage).toHaveBeenCalledBefore(rag.search);
      expect(rag.search).toHaveBeenCalledBefore(ai.generateGroundedAnswer);
      expect(ai.generateGroundedAnswer).toHaveBeenCalledBefore(messages.createAssistantMessage);
      expect(messages.createAssistantMessage).toHaveBeenCalledBefore(conversations.touchAfterMessage);
    });
  });

  // ── 3. Safety hold ────────────────────────────────────────────────────
  describe('safety hold', () => {
    it('stops downstream RAG/LLM and persists the approved HIGH_RISK safety copy', async () => {
      const rag = makeRag();
      const ai = spiedAi();
      const { service, conversations, messages } = build({ rag, ai });

      const result = await service.send(USER_ID, CONVERSATION_ID, { content: 'I feel suicidal' }, IDEMPOTENCY_KEY);

      const args = assistantCreateArgs(messages);
      expect(args[3]).toBe(SAFETY_COPY.HIGH_RISK.en); // content
      expect(args[4]).toBe('SAFETY'); // route
      expect(args[5]).toBe('COMPLETED'); // status
      expect(args[6]).toBe('SAFETY'); // processingStage
      expect(args[7]).toBeNull(); // failureCode
      expect(args[8]).toBeNull(); // failureDetail
      expect(result.assistantMessage).toMatchObject({ route: 'SAFETY', status: 'COMPLETED' });

      // Safety before RAG/LLM — neither downstream collaborator may run
      expect(rag.search).not.toHaveBeenCalled();
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });

    it('persists the CRISIS safety copy for immediate-danger content', async () => {
      const rag = makeRag();
      const { service, messages } = build({ rag });
      await service.send(USER_ID, CONVERSATION_ID, { content: 'I am in immediate danger' }, IDEMPOTENCY_KEY);
      const args = assistantCreateArgs(messages);
      expect(args[3]).toBe(SAFETY_COPY.CRISIS.en);
      expect(args[4]).toBe('SAFETY');
    });
  });

  // ── 4. Safety technical failure ───────────────────────────────────────
  describe('safety technical failure', () => {
    it('persists a FAILED safety assistant message with SAFETY_UNAVAILABLE and skips RAG/LLM', async () => {
      const rag = makeRag();
      const ai = spiedAi();
      const { service, conversations, messages } = build({ rag, ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: '__safety_check_throw__' }, IDEMPOTENCY_KEY);

      const args = assistantCreateArgs(messages);
      expect(args[3]).toBe(CONVERSATION_FALLBACKS.safetyTechnical); // content
      expect(args[4]).toBe('SAFETY'); // route
      expect(args[5]).toBe('FAILED'); // status
      expect(args[6]).toBe('SAFETY'); // processingStage
      expect(args[7]).toBe('SAFETY_UNAVAILABLE'); // failureCode
      expect(args[8]).toBe('safety_check_failed'); // failureDetail

      // failed Safety prevents RAG/LLM
      expect(rag.search).not.toHaveBeenCalled();
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. Static / system-command routing ────────────────────────────────
  describe('static response path', () => {
    it('bypasses RAG and LLM for a greeting and persists a STATIC_RESPONSE assistant message', async () => {
      const rag = makeRag();
      const ai = spiedAi();
      const { service, conversations, messages } = build({ rag, ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'Hello' }, IDEMPOTENCY_KEY);

      const args = assistantCreateArgs(messages);
      expect(args[4]).toBe('STATIC_RESPONSE'); // route
      expect(args[5]).toBe('COMPLETED'); // status
      expect(args[6]).toBeNull(); // processingStage
      expect(args[7]).toBeNull(); // failureCode
      expect(args[8]).toBeNull(); // failureDetail
      expect(rag.search).not.toHaveBeenCalled();
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });

    it('routes a /help system command to SYSTEM_COMMAND and bypasses RAG and LLM', async () => {
      const rag = makeRag();
      const ai = spiedAi();
      const { service, messages } = build({ rag, ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: '/help' }, IDEMPOTENCY_KEY);

      const args = assistantCreateArgs(messages);
      expect(args[4]).toBe('SYSTEM_COMMAND');
      expect(args[5]).toBe('COMPLETED');
      expect(rag.search).not.toHaveBeenCalled();
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
    });
  });

  // ── 6. Follow-up rewrite success ───────────────────────────────────────
  describe('follow-up rewrite success', () => {
    it('uses the rewritten standalone query downstream and records it on the assistant message', async () => {
      const rag = makeRag();
      const ai = spiedAi();
      const { service, messages } = build({
        rag,
        ai,
        recentHistory: [{ role: 'assistant', content: 'paced breathing' }],
      });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'why?' }, IDEMPOTENCY_KEY);

      expect(ai.rewriteFollowUp).toHaveBeenCalledTimes(1);
      expect(rag.search).toHaveBeenCalledTimes(1);
      const ragRequest = (rag.search.mock.calls[0][0] as { question: string });
      expect(ragRequest.question).toBe('why? about paced breathing');
      expect(ai.generateGroundedAnswer).toHaveBeenCalledTimes(1);

      const args = assistantCreateArgs(messages);
      expect(args[4]).toBe('RAG');
      expect(args[5]).toBe('COMPLETED');
      expect(args[6]).toBe('LLM');
      const options = (args[10] ?? {}) as Record<string, unknown>;
      // follow-up: the rewritten query is recorded as the standalone retrieval query
      expect(options.standaloneRetrievalQuery).toBe('why? about paced breathing');
    });
  });

  // ── 7. Follow-up insufficient context ─────────────────────────────────
  describe('follow-up insufficient context', () => {
    it('preserves the insufficient-context response and does not invoke RAG or generation', async () => {
      const rag = makeRag();
      const ai = spiedAi();
      const { service, conversations, messages } = build({ rag, ai, recentHistory: [] });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'why?' }, IDEMPOTENCY_KEY);

      const args = assistantCreateArgs(messages);
      expect(args[3]).toBe(CONVERSATION_FALLBACKS.insufficientContext); // content
      expect(args[4]).toBe('RAG'); // route
      expect(args[5]).toBe('COMPLETED'); // status
      expect(args[6]).toBe('FOLLOW_UP_REWRITE'); // processingStage
      const options = (args[10] ?? {}) as Record<string, unknown>;
      expect(options.reason).toBe('INSUFFICIENT_CONTEXT');

      // no rewrite call (empty history short-circuits before AI), no RAG, no LLM
      expect(ai.rewriteFollowUp).not.toHaveBeenCalled();
      expect(rag.search).not.toHaveBeenCalled();
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── 8. Follow-up rewrite technical failure ────────────────────────────
  describe('follow-up rewrite technical failure', () => {
    it('persists a FAILED FOLLOW_UP_REWRITE assistant message and skips RAG/LLM (current behavior preserved)', async () => {
      const rag = makeRag();
      const ai = spiedAi({
        rewrite: async () => {
          throw new ConversationLlmError('LLM_TIMEOUT');
        },
      });
      const { service, conversations, messages } = build({
        rag,
        ai,
        recentHistory: [{ role: 'assistant', content: 'paced breathing' }],
      });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'why?' }, IDEMPOTENCY_KEY);

      expect(ai.rewriteFollowUp).toHaveBeenCalledTimes(1);
      const args = assistantCreateArgs(messages);
      expect(args[3]).toBe(CONVERSATION_FALLBACKS.nonSafetyTechnical); // content
      expect(args[4]).toBe('RAG'); // route
      expect(args[5]).toBe('FAILED'); // status
      expect(args[6]).toBe('FOLLOW_UP_REWRITE'); // processingStage
      expect(args[7]).toBe('FOLLOW_UP_REWRITE_FAILED'); // failureCode
      expect(args[8]).toBe('follow_up_rewrite_failed'); // failureDetail

      // RAG and grounded LLM must not execute after a failed rewrite
      expect(rag.search).not.toHaveBeenCalled();
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── 9. RAG unavailable / failure ──────────────────────────────────────
  describe('RAG unavailable / failure', () => {
    it('persists RAG_UNAVAILABLE (rag_client_unavailable) when the RAG client is unconfigured, before any LLM call', async () => {
      const ai = spiedAi();
      const { service, conversations, messages } = build({ rag: null, ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

      const args = assistantCreateArgs(messages);
      expect(args[4]).toBe('RAG'); // route
      expect(args[5]).toBe('FAILED'); // status
      expect(args[6]).toBe('RAG'); // processingStage
      expect(args[7]).toBe('RAG_UNAVAILABLE'); // failureCode
      expect(args[8]).toBe('rag_client_unavailable'); // failureDetail
      expect(messages.createAssistantFailure).not.toHaveBeenCalled();
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['unavailable', 'RAG_UNAVAILABLE'],
      ['timeout', 'RAG_TIMEOUT'],
      ['invalid_response', 'RAG_INVALID_RESPONSE'],
    ] as const)(
      'persists a FAILED RAG assistant failure (rag_failed) for RAG search status %s and skips the LLM',
      async (status, failureCode) => {
        const rag = makeRag({ status, correlationId: 'corr', chunks: [], errorCode: 'RAG_UNAVAILABLE' });
        const ai = spiedAi();
        const { service, conversations, messages } = build({ rag, ai });

        await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

        // RAG search failures go through persistFailure (createAssistantFailure), not createAssistantMessage
        expect(messages.createAssistantMessage).not.toHaveBeenCalled();
        expect(messages.createAssistantFailure).toHaveBeenCalledTimes(1);
        const args = assistantFailureArgs(messages);
        expect(args[4]).toBe('RAG'); // route
        expect(args[5]).toBe('RAG'); // processingStage
        expect(args[6]).toBe(failureCode); // failureCode
        expect(args[7]).toBe('rag_failed'); // failureDetail
        // RAG ran but the LLM must not execute
        expect(rag.search).toHaveBeenCalledTimes(1);
        expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
        expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
      },
    );
  });

  // ── 10. Insufficient retrieval evidence ───────────────────────────────
  describe('insufficient retrieval evidence', () => {
    it('persists the insufficient-evidence response with INSUFFICIENT_GROUNDING and does not call the LLM', async () => {
      const rag = makeRag({
        status: 'ok',
        correlationId: 'corr',
        chunks: [{ ...validChunk, score: 0.1 }], // below the 0.44 threshold → no usable chunks
      });
      const ai = spiedAi();
      const { service, conversations, messages } = build({ rag, ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

      const args = assistantCreateArgs(messages);
      expect(args[3]).toBe(buildInsufficientEvidenceResponse()); // content
      expect(args[4]).toBe('RAG'); // route
      expect(args[5]).toBe('COMPLETED'); // status
      expect(args[6]).toBe('RAG'); // processingStage
      const options = (args[10] ?? {}) as Record<string, unknown>;
      expect(options.reason).toBe('INSUFFICIENT_GROUNDING');

      // insufficient evidence must prevent LLM generation
      expect(rag.search).toHaveBeenCalledTimes(1);
      expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── 11. LLM failure ───────────────────────────────────────────────────
  describe('LLM failure', () => {
    it('persists a FAILED LLM assistant failure with the normalized provider code and rag_failed-style detail', async () => {
      const rag = makeRag();
      const ai = spiedAi({
        grounded: async () => {
          throw new ConversationLlmError('LLM_TIMEOUT');
        },
      });
      const { service, conversations, messages } = build({ rag, ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

      expect(rag.search).toHaveBeenCalledTimes(1);
      expect(ai.generateGroundedAnswer).toHaveBeenCalledTimes(1);
      expect(messages.createAssistantMessage).not.toHaveBeenCalled();
      expect(messages.createAssistantFailure).toHaveBeenCalledTimes(1);
      const args = assistantFailureArgs(messages);
      expect(args[4]).toBe('RAG'); // route
      expect(args[5]).toBe('LLM'); // processingStage
      expect(args[6]).toBe('LLM_TIMEOUT'); // failureCode
      expect(args[7]).toBe('llm_failed'); // failureDetail (safeFailureDetail('LLM'))
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });

    it('normalizes empty/invalid LLM output to LLM_INVALID_OUTPUT', async () => {
      const ai = spiedAi({
        grounded: async () => ({ content: '  ', citations: [], modelId: 'fake-conversation-ai' }),
      });
      const { service, messages } = build({ ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

      expect(assistantFailureArgs(messages)[6]).toBe('LLM_INVALID_OUTPUT');
    });

    it('rejects unsafe LLM output as LLM_UNSAFE_OUTPUT via the inline content gate', async () => {
      const ai = spiedAi({
        grounded: async () => ({
          content: 'You should diagnose this condition.',
          citations: [{ chunk_id: 'chunk-1', source_id: 'source-1', text_hash: 'hash-1' }],
          modelId: 'fake-conversation-ai',
        }),
      });
      const { service, messages } = build({ ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

      expect(assistantFailureArgs(messages)[6]).toBe('LLM_UNSAFE_OUTPUT');
      // unsafe output must not be exposed as a successful assistant message
      expect(messages.createAssistantMessage).not.toHaveBeenCalled();
    });

    it('persists LLM_UNAVAILABLE (llm_client_unavailable) when the AI port is unconfigured', async () => {
      const rag = makeRag();
      const { service, messages } = build({ rag, ai: null });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

      const args = assistantCreateArgs(messages);
      expect(args[4]).toBe('RAG'); // route
      expect(args[5]).toBe('FAILED'); // status
      expect(args[6]).toBe('RAG'); // processingStage (the unconfigured-port branch reports stage RAG)
      expect(args[7]).toBe('LLM_UNAVAILABLE'); // failureCode
      expect(args[8]).toBe('llm_client_unavailable'); // failureDetail
      expect(messages.createAssistantFailure).not.toHaveBeenCalled();
    });
  });

  // ── 12. Citation validation / mapping failure ─────────────────────────
  describe('citation validation / mapping failure', () => {
    it('persists a CITATION_VALIDATION failure when the LLM cites an unknown chunk and never persists success', async () => {
      const rag = makeRag();
      const ai = spiedAi({
        grounded: async () => ({
          content: 'A grounded answer.',
          citations: [{ chunk_id: 'missing-chunk', source_id: 'source-1', text_hash: 'hash-1' }],
          modelId: 'fake-conversation-ai',
        }),
      });
      const { service, conversations, messages } = build({ rag, ai });

      await service.send(USER_ID, CONVERSATION_ID, { content: 'What is CBT?' }, IDEMPOTENCY_KEY);

      expect(ai.generateGroundedAnswer).toHaveBeenCalledTimes(1);
      expect(messages.createAssistantMessage).not.toHaveBeenCalled();
      expect(messages.createAssistantFailure).toHaveBeenCalledTimes(1);
      const args = assistantFailureArgs(messages);
      expect(args[4]).toBe('RAG'); // route
      expect(args[5]).toBe('CITATION_VALIDATION'); // processingStage
      expect(args[6]).toBe('LLM_UNSUPPORTED_CITATION'); // failureCode
      expect(args[7]).toBe('citation_validation_failed'); // failureDetail
      expect(conversations.touchAfterMessage).toHaveBeenCalledTimes(1);
    });
  });
});
