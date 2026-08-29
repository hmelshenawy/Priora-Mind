import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  CONVERSATION_AI_PORT,
  normalizeAiFailureCode,
  type ConversationAiPort,
  type ConversationHistoryItem,
} from '../../ai/ai.public';
import type { SendConversationMessageInput } from '../dto/conversation.dto';
import { ConversationAccessService } from './conversation-access.service';
import {
  ConversationArchivedException,
  ConversationNotFoundException,
} from '../constants/conversation.errors';
import { ConversationIdempotencyService } from './conversation-idempotency.service';
import { ConversationMessageRepository } from '../repositories/conversation-message.repository';
import { presentConversationMessage } from '../dto/conversation-presenter';
import { ConversationRouterService } from './conversation-router.service';
import { ConversationRepository } from '../repositories/conversation.repository';
import { ConversationSafetyService } from './conversation-safety.service';
import { ConversationCitationMapper } from '../utils/conversation-citation-mapper';
import { ConversationContextService } from './conversation-context.service';
import { ConversationFollowUpDetector } from '../utils/conversation-follow-up-detector';
import { ConversationFollowUpRewriteService } from './conversation-follow-up-rewrite.service';
import { ConversationGroundingService } from './conversation-grounding.service';
import { ConversationPromptBuilder } from '../utils/conversation-prompt-builder';
import { RetrievalService } from '../../retrieval/retrieval.public';
import { CONVERSATION_FALLBACKS, CONVERSATION_LIMITS } from '../constants/conversation.constants';
import { buildInsufficientEvidenceResponse } from '../utils/conversation-insufficient-evidence';
import { normalizeFailureCode, safeFailureDetail } from '../utils/conversation-failure-metadata';

/** Resolved message-processing context shared by the persistence helpers. */
interface SendContext {
  userId: string;
  conversationId: string;
  userMessage: Awaited<ReturnType<ConversationMessageRepository['createUserMessage']>>;
  userMessageId: string;
}

/** Assistant-message route values accepted by the message repository. */
type AssistantRoute = Parameters<ConversationMessageRepository['createAssistantMessage']>[4];
/** Assistant-message status values accepted by the message repository. */
type AssistantStatus = Parameters<ConversationMessageRepository['createAssistantMessage']>[5];
/** Assistant-message persistence options accepted by the message repository. */
type AssistantOptions = NonNullable<Parameters<ConversationMessageRepository['createAssistantMessage']>[10]>;

/** The presented send response returned to the controller. */
type SendResponse = {
  conversationId: string;
  userMessage: ReturnType<typeof presentConversationMessage>;
  assistantMessage: ReturnType<typeof presentConversationMessage>;
};

@Injectable()
export class ConversationMessageService {
  private readonly logger = new Logger(ConversationMessageService.name);
  private readonly followUpDetector: ConversationFollowUpDetector;
  private readonly context: ConversationContextService;
  private readonly followUpRewrite: ConversationFollowUpRewriteService;
  private readonly grounding: ConversationGroundingService;
  private readonly promptBuilder: ConversationPromptBuilder;
  private readonly citationMapper: ConversationCitationMapper;

  constructor(
    private readonly access: ConversationAccessService,
    private readonly conversations: ConversationRepository,
    private readonly messages: ConversationMessageRepository,
    private readonly idempotency: ConversationIdempotencyService,
    private readonly router: ConversationRouterService,
    private readonly safety: ConversationSafetyService,
    @Optional() private readonly rag?: RetrievalService,
    @Optional() @Inject(CONVERSATION_AI_PORT) private readonly ai?: ConversationAiPort,
  ) {
    this.followUpDetector = new ConversationFollowUpDetector();
    this.context = new ConversationContextService(messages);
    this.followUpRewrite = new ConversationFollowUpRewriteService(ai);
    this.grounding = new ConversationGroundingService();
    this.promptBuilder = new ConversationPromptBuilder();
    this.citationMapper = new ConversationCitationMapper();
  }

  async send(userId: string, conversationId: string, input: SendConversationMessageInput, idempotencyKey?: string) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        error: { code: 'VALIDATION', fields: [{ path: 'X-Idempotency-Key', message: 'Required' }] },
      });
    }
    await this.access.assertEligible(userId);
    const conversation = await this.conversations.findOwned(userId, conversationId);
    if (!conversation) throw new ConversationNotFoundException();
    if (conversation.status === 'ARCHIVED') throw new ConversationArchivedException();

    const stored = await this.idempotency.findStoredResult(userId, conversationId, idempotencyKey);
    if (stored) {
      return {
        conversationId,
        userMessage: presentConversationMessage(stored.userMessage),
        assistantMessage: presentConversationMessage(stored.assistantMessage),
      };
    }

    const now = new Date();
    const userMessage = await this.messages.createUserMessage(userId, conversationId, input.content, idempotencyKey, now);
    const ctx: SendContext = { userId, conversationId, userMessage, userMessageId: userMessage.id };

    const early = await this.routeSafetyAndStatic(ctx, input.content);
    if (early) return early;

    const correlationId = `conversation-${conversationId}-${userMessage.id}`;
    const recentHistory = await this.context.loadRecentHistory(userId, conversationId, userMessage.id);
    const resolved = await this.resolveStandaloneQuery(ctx, correlationId, recentHistory, input.content);
    if ('redirect' in resolved) return resolved.redirect;
    const standaloneRetrievalQuery = resolved.query;
    const isFollowUp = resolved.isFollowUp;

    if (!this.rag || !this.ai) {
      return this.persistAssistant(ctx, CONVERSATION_FALLBACKS.nonSafetyTechnical, 'RAG', 'FAILED', 'RAG', !this.rag ? 'RAG_UNAVAILABLE' : 'LLM_UNAVAILABLE', !this.rag ? 'rag_client_unavailable' : 'llm_client_unavailable', { standaloneRetrievalQuery: isFollowUp ? standaloneRetrievalQuery : null });
    }

    const ragResult = await this.searchRagSafely(standaloneRetrievalQuery, correlationId);
    if (ragResult.status === 'timeout' || ragResult.status === 'unavailable' || ragResult.status === 'invalid_response') {
      return this.persistFailureAndReturn(ctx, 'RAG', this.ragFailureCode(ragResult.status, ragResult.errorCode));
    }
    const chunks = this.grounding.selectSufficientChunks(ragResult);
    if (chunks.length === 0) {
      return this.persistAssistant(ctx, buildInsufficientEvidenceResponse(), 'RAG', 'COMPLETED', 'RAG', null, null, { reason: 'INSUFFICIENT_GROUNDING', standaloneRetrievalQuery: isFollowUp ? standaloneRetrievalQuery : null });
    }

    const prompt = this.promptBuilder.build({ recentHistory, currentMessage: input.content, standaloneRetrievalQuery, chunks });
    const answer = await this.generateAnswerSafely({ correlationId, ...prompt });
    if ('failureCode' in answer) return this.persistFailureAndReturn(ctx, 'LLM', answer.failureCode);
    const sources = this.mapCitationsSafely(answer, chunks);
    if ('failureCode' in sources) return this.persistFailureAndReturn(ctx, 'CITATION_VALIDATION', sources.failureCode);
    return this.persistAssistant(ctx, answer.content, 'RAG', 'COMPLETED', 'LLM', null, null, {
      standaloneRetrievalQuery: isFollowUp ? standaloneRetrievalQuery : null,
      provider: 'conversation-ai',
      modelId: answer.modelId,
      tokenUsage: answer.usage ?? null,
      latencyMs: answer.latencyMs ?? null,
      sources,
    });
  }

  /** Safety evaluation and static/system-command routing — both bypass RAG/LLM.
   *  Returns the presented response when routing short-circuits, or null to continue. */
  private async routeSafetyAndStatic(ctx: SendContext, content: string): Promise<SendResponse | null> {
    const safetyDecision = await this.safety.evaluate(content);
    if (safetyDecision.route === 'failed') {
      return this.persistAssistant(ctx, safetyDecision.content, 'SAFETY', 'FAILED', 'SAFETY', safetyDecision.failureCode, 'safety_check_failed');
    }
    if (safetyDecision.route === 'safety') {
      return this.persistAssistant(ctx, safetyDecision.content, 'SAFETY', 'COMPLETED', 'SAFETY', null, null);
    }
    const staticDecision = this.router.detectStaticOrSystemResponse(content);
    if (staticDecision) {
      return this.persistAssistant(ctx, staticDecision.content, staticDecision.route, 'COMPLETED', null, null, null);
    }
    return null;
  }

  /** Follow-up detection and standalone-query resolution. Returns either a redirect
   *  response (insufficient context / rewrite failure) or the resolved retrieval query
   *  plus whether the message was treated as a follow-up. */
  private async resolveStandaloneQuery(
    ctx: SendContext,
    correlationId: string,
    recentHistory: ConversationHistoryItem[],
    content: string,
  ): Promise<{ redirect: SendResponse } | { query: string; isFollowUp: boolean }> {
    if (!this.followUpDetector.isFollowUp(content)) {
      return { query: content.trim(), isFollowUp: false };
    }
    const rewrite = await this.followUpRewrite.rewrite({ correlationId, recentHistory, currentMessage: content });
    if (rewrite.status === 'insufficient_context') {
      return { redirect: await this.persistAssistant(ctx, CONVERSATION_FALLBACKS.insufficientContext, 'RAG', 'COMPLETED', 'FOLLOW_UP_REWRITE', null, null, { reason: 'INSUFFICIENT_CONTEXT' }) };
    }
    if (rewrite.status === 'failed') {
      return { redirect: await this.persistAssistant(ctx, CONVERSATION_FALLBACKS.nonSafetyTechnical, 'RAG', 'FAILED', 'FOLLOW_UP_REWRITE', rewrite.failureCode, 'follow_up_rewrite_failed') };
    }
    return { query: rewrite.result.standaloneRetrievalQuery.trim(), isFollowUp: true };
  }

  /** Persists a completed/failed assistant message via `createAssistantMessage`,
   *  updates conversation activity, and returns the presented response triple.
   *  Forwards the exact positional arguments the repository expects. */
  private async persistAssistant(
    ctx: SendContext,
    content: string,
    route: AssistantRoute,
    status: AssistantStatus,
    processingStage: string | null,
    failureCode: string | null,
    failureDetail: string | null,
    options: AssistantOptions = {},
  ): Promise<SendResponse> {
    // Preserve the exact repository call shape: branches without options pass 10
    // positional args (no trailing {}); branches with options pass 11. Downstream
    // contracts assert on the argument count.
    const assistantMessage = Object.keys(options).length
      ? await this.messages.createAssistantMessage(ctx.userId, ctx.conversationId, ctx.userMessageId, content, route, status, processingStage, failureCode, failureDetail, new Date(), options)
      : await this.messages.createAssistantMessage(ctx.userId, ctx.conversationId, ctx.userMessageId, content, route, status, processingStage, failureCode, failureDetail, new Date());
    await this.conversations.touchAfterMessage(ctx.userId, ctx.conversationId, assistantMessage.completedAt ?? assistantMessage.createdAt);
    return {
      conversationId: ctx.conversationId,
      userMessage: presentConversationMessage(ctx.userMessage),
      assistantMessage: presentConversationMessage(assistantMessage),
    };
  }

  /** Persists a failure via `createAssistantFailure`, updates conversation activity,
   *  and returns the presented response triple. */
  private async persistFailureAndReturn(ctx: SendContext, processingStage: string, failureCode: string): Promise<SendResponse> {
    const assistantMessage = await this.persistFailure(ctx.userId, ctx.conversationId, ctx.userMessageId, processingStage, failureCode);
    await this.conversations.touchAfterMessage(ctx.userId, ctx.conversationId, assistantMessage.completedAt ?? assistantMessage.createdAt);
    return {
      conversationId: ctx.conversationId,
      userMessage: presentConversationMessage(ctx.userMessage),
      assistantMessage: presentConversationMessage(assistantMessage),
    };
  }

  private async searchRagSafely(question: string, correlationId: string) {
    try {
      return await this.rag!.search(
        { question, limit: CONVERSATION_LIMITS.ragLimit, score_threshold: CONVERSATION_LIMITS.ragScoreThreshold },
        correlationId,
      );
    } catch {
      return { status: 'unavailable' as const, correlationId, chunks: [], errorCode: 'RAG_UNAVAILABLE' };
    }
  }

  private ragFailureCode(status: string, errorCode?: string): string {
    if (status === 'timeout') return 'RAG_TIMEOUT';
    if (status === 'invalid_response') return 'RAG_INVALID_RESPONSE';
    return normalizeFailureCode(errorCode, 'RAG_UNAVAILABLE');
  }

  private async generateAnswerSafely(request: Parameters<ConversationAiPort['generateGroundedAnswer']>[0]) {
    try {
      const answer = await this.ai!.generateGroundedAnswer(request);
      if (!answer.content?.trim() || !Array.isArray(answer.citations) || !answer.modelId?.trim()) {
        return { failureCode: 'LLM_INVALID_OUTPUT' } as const;
      }
      if (/\b(diagnose|prescribe|stop medication|increase medication)\b/i.test(answer.content)) {
        return { failureCode: 'LLM_UNSAFE_OUTPUT' } as const;
      }
      return answer;
    } catch (error) {
      return { failureCode: normalizeAiFailureCode(error) } as const;
    }
  }

  private mapCitationsSafely(
    answer: Exclude<Awaited<ReturnType<ConversationMessageService['generateAnswerSafely']>>, { failureCode: string }>,
    chunks: Parameters<ConversationCitationMapper['map']>[1],
  ) {
    try {
      return this.citationMapper.map(answer, chunks);
    } catch {
      return { failureCode: 'LLM_UNSUPPORTED_CITATION' } as const;
    }
  }

  private persistFailure(userId: string, conversationId: string, userMessageId: string, processingStage: string, failureCode: string) {
    const safeCode = normalizeFailureCode(failureCode, 'ORCHESTRATION_FAILED');
    this.logger.warn({ event: 'conversation_assistant_failed', conversationId, userMessageId, processingStage, failureCode: safeCode });
    return this.messages.createAssistantFailure(
      userId, conversationId, userMessageId, CONVERSATION_FALLBACKS.nonSafetyTechnical,
      'RAG', processingStage, safeCode, safeFailureDetail(processingStage), new Date(),
    );
  }
}
