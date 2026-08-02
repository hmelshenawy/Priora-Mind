import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import type { ConversationAiPort } from '../ai/conversation-ai.port';
import { CONVERSATION_AI_PORT } from '../ai/conversation-ai.port';
import type { SendConversationMessageInput } from './conversation.dto';
import { ConversationAccessService } from './conversation-access.service';
import {
  ConversationArchivedException,
  ConversationNotFoundException,
} from './conversation.errors';
import { ConversationIdempotencyService } from './conversation-idempotency.service';
import { ConversationMessageRepository } from './conversation-message.repository';
import { presentConversationMessage } from './conversation-presenter';
import { ConversationRouterService } from './conversation-router.service';
import { ConversationRepository } from './conversation.repository';
import { ConversationSafetyService } from './conversation-safety.service';
import { ConversationCitationMapper } from './conversation-citation-mapper';
import { ConversationContextService } from './conversation-context.service';
import { ConversationFollowUpDetector } from './conversation-follow-up-detector';
import { ConversationFollowUpRewriteService } from './conversation-follow-up-rewrite.service';
import { ConversationGroundingService } from './conversation-grounding.service';
import { ConversationPromptBuilder } from './conversation-prompt-builder';
import type { ConversationRagClientPort } from './rag/conversation-rag-client.port';
import { CONVERSATION_RAG_CLIENT_PORT } from './rag/conversation-rag-client.port';
import { CONVERSATION_FALLBACKS, CONVERSATION_LIMITS } from './conversation.constants';
import { buildInsufficientEvidenceResponse } from './conversation-insufficient-evidence';
import { normalizeConversationLlmError } from '../ai/conversation-llm.adapter';
import { normalizeFailureCode, safeFailureDetail } from './conversation-failure-metadata';

@Injectable()
export class ConversationMessageService {
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
    @Optional() @Inject(CONVERSATION_RAG_CLIENT_PORT) private readonly rag?: ConversationRagClientPort,
    @Optional() @Inject(CONVERSATION_AI_PORT) private readonly ai?: ConversationAiPort,
  ) {
    this.followUpDetector = new ConversationFollowUpDetector();
    this.context = new ConversationContextService(messages);
    this.followUpRewrite = new ConversationFollowUpRewriteService(ai);
    this.grounding = new ConversationGroundingService();
    this.promptBuilder = new ConversationPromptBuilder();
    this.citationMapper = new ConversationCitationMapper();
  }

  async send(
    userId: string,
    conversationId: string,
    input: SendConversationMessageInput,
    idempotencyKey?: string,
  ) {
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
    const userMessage = await this.messages.createUserMessage(
      userId,
      conversationId,
      input.content,
      idempotencyKey,
      now,
    );
    const safetyDecision = await this.safety.evaluate(input.content);
    if (safetyDecision.route === 'failed') {
      const assistantMessage = await this.messages.createAssistantMessage(
        userId,
        conversationId,
        userMessage.id,
        safetyDecision.content,
        'SAFETY',
        'FAILED',
        'SAFETY',
        safetyDecision.failureCode,
        'safety_check_failed',
        new Date(),
      );
      await this.conversations.touchAfterMessage(
        userId,
        conversationId,
        assistantMessage.completedAt ?? assistantMessage.createdAt,
      );
      return {
        conversationId,
        userMessage: presentConversationMessage(userMessage),
        assistantMessage: presentConversationMessage(assistantMessage),
      };
    }
    if (safetyDecision.route === 'safety') {
      const assistantMessage = await this.messages.createAssistantMessage(
        userId,
        conversationId,
        userMessage.id,
        safetyDecision.content,
        'SAFETY',
        'COMPLETED',
        'SAFETY',
        null,
        null,
        new Date(),
      );
      await this.conversations.touchAfterMessage(
        userId,
        conversationId,
        assistantMessage.completedAt ?? assistantMessage.createdAt,
      );
      return {
        conversationId,
        userMessage: presentConversationMessage(userMessage),
        assistantMessage: presentConversationMessage(assistantMessage),
      };
    }

    const staticDecision = this.router.detectStaticOrSystemResponse(input.content);
    if (staticDecision) {
      const assistantMessage = await this.messages.createAssistantMessage(
        userId,
        conversationId,
        userMessage.id,
        staticDecision.content,
        staticDecision.route,
        'COMPLETED',
        null,
        null,
        null,
        new Date(),
      );
      await this.conversations.touchAfterMessage(
        userId,
        conversationId,
        assistantMessage.completedAt ?? assistantMessage.createdAt,
      );
      return {
        conversationId,
        userMessage: presentConversationMessage(userMessage),
        assistantMessage: presentConversationMessage(assistantMessage),
      };
    }

    const correlationId = `conversation-${conversationId}-${userMessage.id}`;
    const recentHistory = await this.context.loadRecentHistory(userId, conversationId);
    let standaloneRetrievalQuery = input.content.trim();
    const isFollowUp = this.followUpDetector.isFollowUp(input.content);
    if (isFollowUp) {
      const rewrite = await this.followUpRewrite.rewrite({
        correlationId,
        recentHistory,
        currentMessage: input.content,
      });
      if (rewrite.status === 'insufficient_context') {
        const assistantMessage = await this.messages.createAssistantMessage(
          userId,
          conversationId,
          userMessage.id,
          CONVERSATION_FALLBACKS.insufficientContext,
          'RAG',
          'COMPLETED',
          'FOLLOW_UP_REWRITE',
          null,
          null,
          new Date(),
          { reason: 'INSUFFICIENT_CONTEXT' },
        );
        await this.conversations.touchAfterMessage(
          userId,
          conversationId,
          assistantMessage.completedAt ?? assistantMessage.createdAt,
        );
        return {
          conversationId,
          userMessage: presentConversationMessage(userMessage),
          assistantMessage: presentConversationMessage(assistantMessage),
        };
      }
      if (rewrite.status === 'failed') {
        const assistantMessage = await this.messages.createAssistantMessage(
          userId,
          conversationId,
          userMessage.id,
          CONVERSATION_FALLBACKS.nonSafetyTechnical,
          'RAG',
          'FAILED',
          'FOLLOW_UP_REWRITE',
          rewrite.failureCode,
          'follow_up_rewrite_failed',
          new Date(),
        );
        await this.conversations.touchAfterMessage(
          userId,
          conversationId,
          assistantMessage.completedAt ?? assistantMessage.createdAt,
        );
        return {
          conversationId,
          userMessage: presentConversationMessage(userMessage),
          assistantMessage: presentConversationMessage(assistantMessage),
        };
      }
      standaloneRetrievalQuery = rewrite.result.standaloneRetrievalQuery.trim();
    }

    if (!this.rag || !this.ai) {
      const assistantMessage = await this.messages.createAssistantMessage(
        userId,
        conversationId,
        userMessage.id,
        CONVERSATION_FALLBACKS.nonSafetyTechnical,
        'RAG',
        'FAILED',
        'RAG',
        !this.rag ? 'RAG_UNAVAILABLE' : 'LLM_UNAVAILABLE',
        !this.rag ? 'rag_client_unavailable' : 'llm_client_unavailable',
        new Date(),
        { standaloneRetrievalQuery: isFollowUp ? standaloneRetrievalQuery : null },
      );
      await this.conversations.touchAfterMessage(
        userId,
        conversationId,
        assistantMessage.completedAt ?? assistantMessage.createdAt,
      );
      return {
        conversationId,
        userMessage: presentConversationMessage(userMessage),
        assistantMessage: presentConversationMessage(assistantMessage),
      };
    }

    const ragResult = await this.searchRagSafely(standaloneRetrievalQuery, correlationId);
    if (ragResult.status === 'timeout' || ragResult.status === 'unavailable' || ragResult.status === 'invalid_response') {
      const assistantMessage = await this.persistFailure(
        userId,
        conversationId,
        userMessage.id,
        'RAG',
        this.ragFailureCode(ragResult.status, ragResult.errorCode),
      );
      await this.conversations.touchAfterMessage(
        userId,
        conversationId,
        assistantMessage.completedAt ?? assistantMessage.createdAt,
      );
      return {
        conversationId,
        userMessage: presentConversationMessage(userMessage),
        assistantMessage: presentConversationMessage(assistantMessage),
      };
    }
    const chunks = this.grounding.selectSufficientChunks(ragResult);
    if (chunks.length === 0) {
      const assistantMessage = await this.messages.createAssistantMessage(
        userId,
        conversationId,
        userMessage.id,
        buildInsufficientEvidenceResponse(),
        'RAG',
        'COMPLETED',
        'RAG',
        null,
        null,
        new Date(),
        { reason: 'INSUFFICIENT_GROUNDING', standaloneRetrievalQuery: isFollowUp ? standaloneRetrievalQuery : null },
      );
      await this.conversations.touchAfterMessage(
        userId,
        conversationId,
        assistantMessage.completedAt ?? assistantMessage.createdAt,
      );
      return {
        conversationId,
        userMessage: presentConversationMessage(userMessage),
        assistantMessage: presentConversationMessage(assistantMessage),
      };
    }

    const prompt = this.promptBuilder.build({
      recentHistory,
      currentMessage: input.content,
      standaloneRetrievalQuery,
      chunks,
    });
    const answer = await this.generateAnswerSafely({ correlationId, ...prompt });
    if ('failureCode' in answer) {
      const assistantMessage = await this.persistFailure(
        userId,
        conversationId,
        userMessage.id,
        'LLM',
        answer.failureCode,
      );
      await this.conversations.touchAfterMessage(
        userId,
        conversationId,
        assistantMessage.completedAt ?? assistantMessage.createdAt,
      );
      return {
        conversationId,
        userMessage: presentConversationMessage(userMessage),
        assistantMessage: presentConversationMessage(assistantMessage),
      };
    }
    const sources = this.mapCitationsSafely(answer, chunks);
    if ('failureCode' in sources) {
      const assistantMessage = await this.persistFailure(
        userId,
        conversationId,
        userMessage.id,
        'CITATION_VALIDATION',
        sources.failureCode,
      );
      await this.conversations.touchAfterMessage(
        userId,
        conversationId,
        assistantMessage.completedAt ?? assistantMessage.createdAt,
      );
      return {
        conversationId,
        userMessage: presentConversationMessage(userMessage),
        assistantMessage: presentConversationMessage(assistantMessage),
      };
    }
    const assistantMessage = await this.messages.createAssistantMessage(
      userId,
      conversationId,
      userMessage.id,
      answer.content,
      'RAG',
      'COMPLETED',
      'LLM',
      null,
      null,
      new Date(),
      {
        standaloneRetrievalQuery: isFollowUp ? standaloneRetrievalQuery : null,
        provider: 'conversation-ai',
        modelId: answer.modelId,
        tokenUsage: answer.usage ?? null,
        latencyMs: answer.latencyMs ?? null,
        sources,
      },
    );
    await this.conversations.touchAfterMessage(
      userId,
      conversationId,
      assistantMessage.completedAt ?? assistantMessage.createdAt,
    );
    return {
      conversationId,
      userMessage: presentConversationMessage(userMessage),
      assistantMessage: presentConversationMessage(assistantMessage),
    };
  }

  private async searchRagSafely(question: string, correlationId: string) {
    try {
      return await this.rag!.search(
        {
          question,
          limit: CONVERSATION_LIMITS.ragLimit,
          score_threshold: CONVERSATION_LIMITS.ragScoreThreshold,
        },
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
      return { failureCode: normalizeConversationLlmError(error) } as const;
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

  private persistFailure(
    userId: string,
    conversationId: string,
    userMessageId: string,
    processingStage: string,
    failureCode: string,
  ) {
    return this.messages.createAssistantFailure(
      userId,
      conversationId,
      userMessageId,
      CONVERSATION_FALLBACKS.nonSafetyTechnical,
      'RAG',
      processingStage,
      normalizeFailureCode(failureCode, 'ORCHESTRATION_FAILED'),
      safeFailureDetail(processingStage),
      new Date(),
    );
  }
}
